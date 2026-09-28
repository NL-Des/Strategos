import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  CellType,
  cellRef,
  ErrorCode,
  type FormDefinition,
  type FormMode,
  type SubmissionValues,
  SubmissionStatus,
  type WrittenCell,
} from '@strategos/shared';
import { type AuditActor, SYSTEM_ACTOR } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, Submission } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMPTY_CELL } from '../sources/cell-format.js';
import {
  positionKey,
  SourceDataService,
  SourceUnavailableError,
} from '../sources/source-data.service.js';
import { type CellWrite, SourceWriteService } from '../sources/source-write.service.js';
import { FormDataService } from './form-data.service.js';
import {
  fieldTarget,
  inPerimeter,
  storedText,
  toStoredValue,
  validateValues,
} from './form-definition.js';
import { publishedOf } from './forms.service.js';

/** Ce qu'une validation a réellement écrit (`submissions.written`). */
export interface Written {
  values: SubmissionValues;
  cells: WrittenCell[];
}

export interface ApplyResult {
  cells: WrittenCell[];
  /** Ligne attribuée à un ajout. */
  assignedRow: number | null;
}

interface Decision {
  actor: AuditActor;
  /** Valideur ; `null` = validation automatique (« système »). */
  deciderId: string | null;
  /** Écraser une cellule-formule a été confirmé (ou validation automatique). */
  confirm: boolean;
  /** Valeurs corrigées par l'admin → statut `modified`. */
  values?: SubmissionValues;
}

const unprocessable = (code: ErrorCode, details: Record<string, unknown> = {}) =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, details);

/** Somme d'un mouvement, sans les écarts des nombres flottants (0,1 + 0,2). */
const addMovement = (current: number, movement: number) =>
  Math.round((current + movement) * 1e10) / 1e10;

/**
 * Validation des soumissions (09 — Points techniques) : un seul chemin pour la
 * validation manuelle, la validation automatique et la réapplication d'un
 * réimport. Les écritures d'une source sont sérialisées par un verrou pris dans
 * la transaction ; la ligne d'un ajout et la valeur de départ d'un mouvement
 * sont lues après ce verrou.
 */
@Injectable()
export class SubmissionProcessor {
  private readonly logger = new Logger(SubmissionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly data: SourceDataService,
    private readonly writer: SourceWriteService,
    private readonly formData: FormDataService,
  ) {}

  /**
   * Écrit les valeurs dans la source : cellule du champ (modification), ligne
   * retrouvée par sa clé (ligne) ou première ligne vide de la zone (ajout). Rien
   * n'est écrit hors du périmètre défini par l'admin.
   */
  async apply(
    tx: Prisma.TransactionClient,
    mode: FormMode,
    def: FormDefinition,
    values: SubmissionValues,
    rowKey: string | null,
    options: { acceptFormulas: boolean },
  ): Promise<ApplyResult> {
    const sourceId = def.sourceId!;
    await this.writer.lock(tx, sourceId);
    let row: number | undefined;
    if (mode === 'ligne') {
      const rows = await this.formData.keyRows(def, rowKey ?? '', tx);
      if (rows.length === 0) throw unprocessable(ErrorCode.ROW_KEY_NOT_FOUND);
      if (rows.length > 1) throw unprocessable(ErrorCode.ROW_KEY_DUPLICATE, { rows: rows.length });
      row = rows[0];
    } else if (mode === 'ajout') {
      const free = await this.formData.freeRow(def, tx);
      if (free === null) throw unprocessable(ErrorCode.ADD_ZONE_FULL);
      row = free;
    }

    const targets = def.fields.flatMap((field) => {
      const value = values[field.key] ?? null;
      return value === null ? [] : [{ field, value, cell: fieldTarget(def, field, row) }];
    });
    for (const t of targets) {
      // Défense en profondeur : la cible découle de la définition, jamais de la requête.
      if (!inPerimeter(mode, def, t.field, t.cell)) {
        throw new Error(`Écriture hors du périmètre du formulaire : ${cellRef(t.cell)}`);
      }
    }
    if (targets.length === 0) return { cells: [], assignedRow: row ?? null };

    if (!options.acceptFormulas) {
      const formulas = await this.writer.formulaCells(
        tx,
        sourceId,
        targets.map((t) => t.cell),
      );
      if (formulas.length > 0) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, {
          warnings: this.formData.formulaWarning(formulas),
        });
      }
    }

    const rows = targets.map((t) => t.cell.row);
    const cols = targets.map((t) => t.cell.col);
    const current = await this.data.readRect(
      sourceId,
      def.sheet!,
      {
        top: Math.min(...rows),
        bottom: Math.max(...rows),
        left: Math.min(...cols),
        right: Math.max(...cols),
      },
      tx,
    );
    const writes: CellWrite[] = [];
    const cells: WrittenCell[] = [];
    for (const { field, value, cell } of targets) {
      const before = current.get(positionKey(cell.row, cell.col)) ?? EMPTY_CELL;
      let stored = toStoredValue(field, value);
      if (field.movement && typeof value === 'number') {
        if (before.type !== CellType.number || before.number === null) {
          throw unprocessable(ErrorCode.MOVEMENT_NOT_NUMERIC, { field: field.key });
        }
        const after = addMovement(before.number, value);
        stored = { type: CellType.number, text: String(after), number: after };
      }
      writes.push({ ...cell, value: stored });
      cells.push({
        field: field.key,
        sourceId,
        ...cell,
        before: storedText(before),
        after: storedText(stored),
        ...(field.movement && typeof value === 'number' ? { movement: value } : {}),
      });
    }
    await this.writer.writeCells(tx, sourceId, writes);
    return { cells, assignedRow: mode === 'ajout' ? row! : null };
  }

  /**
   * Valide une soumission en attente (ou la valide avec des valeurs corrigées).
   * Une cellule-formule visée demande une confirmation, sauf en validation
   * automatique ; une règle bloquante laisse la soumission `pending`.
   */
  async validate(id: string, decision: Decision): Promise<Submission> {
    try {
      return await this.prisma.$transaction((tx) => this.decide(tx, id, decision), {
        timeout: 30_000,
        maxWait: 30_000,
      });
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SOURCE_UNAVAILABLE);
      }
      throw error;
    }
  }

  /**
   * Validation automatique, juste après la soumission : même chemin, avec le
   * « système » comme valideur. En cas d'échec, la soumission reste en attente
   * et apparaît dans le tableau de bord de l'admin.
   */
  async validateAutomatically(id: string): Promise<boolean> {
    try {
      await this.validate(id, { actor: SYSTEM_ACTOR, deciderId: null, confirm: true });
      return true;
    } catch (error) {
      if (!(error instanceof AppException)) {
        this.logger.error(`Validation automatique de ${id} impossible`, error as Error);
      }
      return false;
    }
  }

  /** Refuse une soumission en attente, avec un motif facultatif. */
  async reject(id: string, reason: string | null, deciderId: string, actor: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const decidedAt = new Date();
      const { count } = await tx.submission.updateMany({
        where: { id, status: SubmissionStatus.pending },
        data: { status: SubmissionStatus.rejected, reason, decidedAt, decidedBy: deciderId },
      });
      if (count === 0) await this.notPending(tx, id);
      await this.audit.record(tx, actor, {
        action: AuditAction.SUBMISSION_REJECT,
        targetType: AuditTargetType.SUBMISSION,
        targetId: id,
        before: { status: SubmissionStatus.pending },
        after: { status: SubmissionStatus.rejected, reason },
      });
      return tx.submission.findUniqueOrThrow({ where: { id } });
    });
  }

  private async decide(
    tx: Prisma.TransactionClient,
    id: string,
    decision: Decision,
  ): Promise<Submission> {
    const submission = await tx.submission.findUnique({
      where: { id },
      include: { form: { include: { published: true } }, user: true },
    });
    if (!submission) throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    const { form } = submission;
    const def = publishedOf(form);
    if (!def?.sourceId) await this.notPending(tx, id);
    // Verrou d'abord, puis relecture du statut : deux validations simultanées
    // de la même soumission ne l'écrivent pas deux fois.
    await this.writer.lock(tx, def!.sourceId!);
    const { status } = await tx.submission.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (status !== SubmissionStatus.pending) await this.notPending(tx, id);

    let values = submission.values as SubmissionValues;
    if (decision.values) {
      // Les champs automatiques gardent l'auteur et la date de la soumission.
      const checked = validateValues(def!, decision.values, {
        username: submission.user.username,
        now: submission.createdAt,
        options: await this.formData.options(def!),
      });
      if (Object.keys(checked.fields).length > 0) {
        throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
          fields: checked.fields,
        });
      }
      values = checked.values;
    }

    const result = await this.apply(tx, form.mode, def!, values, submission.rowKey, {
      acceptFormulas: decision.confirm,
    });
    const newStatus = decision.values ? SubmissionStatus.modified : SubmissionStatus.validated;
    const written: Written = { values, cells: result.cells };
    const { count } = await tx.submission.updateMany({
      where: { id, status: SubmissionStatus.pending },
      data: {
        status: newStatus,
        written: written as unknown as Prisma.InputJsonValue,
        assignedRow: result.assignedRow,
        decidedAt: new Date(),
        decidedBy: decision.deciderId,
      },
    });
    if (count === 0) await this.notPending(tx, id);

    const source = await tx.source.findUnique({ where: { id: def!.sourceId! } });
    await this.audit.record(tx, decision.actor, {
      action: decision.values ? AuditAction.SUBMISSION_MODIFY : AuditAction.SUBMISSION_VALIDATE,
      targetType: AuditTargetType.SUBMISSION,
      targetId: id,
      before: { status: SubmissionStatus.pending, values: submission.values },
      after: {
        status: newStatus,
        formId: form.id,
        formTitle: def!.title,
        source: { id: def!.sourceId, name: source?.name ?? null },
        cells: result.cells.map((c) => ({
          cell: `${c.sheet}!${cellRef(c)}`,
          before: c.before,
          after: c.after,
          ...(c.movement !== undefined ? { movement: c.movement } : {}),
        })),
        ...(decision.values ? { values } : {}),
      },
    });
    return tx.submission.findUniqueOrThrow({ where: { id } });
  }

  /** `404` si la soumission n'existe pas, sinon `409 SUBMISSION_NOT_PENDING`. */
  private async notPending(tx: Prisma.TransactionClient, id: string): Promise<never> {
    const exists = await tx.submission.count({ where: { id } });
    throw exists
      ? new AppException(HttpStatus.CONFLICT, ErrorCode.SUBMISSION_NOT_PENDING)
      : new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}
