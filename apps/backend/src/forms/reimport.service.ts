import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AuditAction,
  AuditTargetType,
  CellType,
  cellRef,
  ErrorCode,
  type FormDefinition,
  type LostValidation,
  type ReimportMode,
  type ReimportPreview,
  SourceType,
  SubmissionStatus,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { config } from '../config.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ParsedWorkbook } from '../sources/excel-parser.js';
import { SourcesService } from '../sources/sources.service.js';
import { SubmissionProcessor, type Written } from './submission-processor.service.js';

/** Durée de validité d'un aperçu de réimport (14 — `reimport_previews`). */
const PREVIEW_TTL_MS = 30 * 60 * 1000;

const expired = () => new AppException(HttpStatus.CONFLICT, ErrorCode.REIMPORT_TOKEN_EXPIRED);

/**
 * Réimport d'un Excel uploadé (08 — Version de référence et réimport), en deux
 * temps : l'aperçu liste les validations que le nouveau fichier ferait perdre,
 * puis l'admin écrase ou les réapplique (annuler = ne pas confirmer).
 */
@Injectable()
export class ReimportService {
  private readonly logger = new Logger(ReimportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sources: SourcesService,
    private readonly processor: SubmissionProcessor,
  ) {}

  async preview(
    sourceId: string,
    file: { buffer: Buffer },
    actor: AuditActor & { kind: 'user' },
  ): Promise<ReimportPreview> {
    const source = await this.sources.get(sourceId);
    if (source.type !== SourceType.upload) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.SOURCE_NOT_UPLOAD);
    }
    const workbook = await this.sources.readWorkbook(file.buffer);
    const lost = await this.lostValidations(sourceId, source.lastDownloadedAt, workbook);
    const storagePath = await this.sources.storeFile(file.buffer);
    const preview = await this.prisma.reimportPreview.create({
      data: {
        sourceId,
        uploadedFilePath: storagePath,
        lostValidations: lost as unknown as Prisma.InputJsonValue,
        createdBy: actor.userId,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
      },
    });
    return {
      reimportToken: preview.id,
      expiresAt: preview.expiresAt.toISOString(),
      lastDownloadedAt: source.lastDownloadedAt?.toISOString() ?? null,
      lostValidations: lost,
    };
  }

  /**
   * Remplace le staging par le nouveau fichier. `reapply` réécrit les
   * validations perdues dans l'ordre où elles ont été validées, par le même
   * chemin qu'une validation (clé retrouvée, première ligne vide, mouvement
   * appliqué à la nouvelle valeur) ; un échec annule tout le réimport.
   */
  async confirm(
    sourceId: string,
    token: string,
    mode: ReimportMode,
    actor: AuditActor,
  ): Promise<void> {
    const preview = await this.prisma.reimportPreview.findFirst({ where: { id: token, sourceId } });
    if (!preview || preview.expiresAt <= new Date()) throw expired();
    const source = await this.sources.get(sourceId);
    const buffer = await readFile(join(config.uploadsDir, preview.uploadedFilePath)).catch(() => {
      throw expired();
    });
    const workbook = await this.sources.readWorkbook(buffer);
    const lost = preview.lostValidations as unknown as LostValidation[];
    const submissionIds = [...new Set(lost.map((l) => l.submissionId))];

    const { oldPath } = await this.prisma.$transaction(
      async (tx) => {
        // Même file que les validations : aucune écriture concurrente pendant le réimport.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourceId}, 0))`;
        const { count } = await tx.reimportPreview.deleteMany({ where: { id: token } });
        if (count === 0) throw expired();
        const restaged = await this.sources.restage(tx, source, workbook, preview.uploadedFilePath);
        const reapplied = mode === 'reapply' ? await this.reapply(tx, submissionIds) : [];
        await this.audit.record(tx, actor, {
          action: AuditAction.SOURCE_REIMPORT,
          targetType: AuditTargetType.SOURCE,
          targetId: sourceId,
          before: {
            name: source.name,
            lastImportedAt: source.lastImportedAt?.toISOString() ?? null,
          },
          after: {
            name: source.name,
            mode,
            cells: restaged.cells,
            links: restaged.links,
            lostValidations: lost.map((l) => ({ submissionId: l.submissionId, cell: l.cell })),
            reapplied,
          },
        });
        return restaged;
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    await unlink(join(config.uploadsDir, oldPath)).catch(() => undefined);
  }

  /** Aperçus expirés : la ligne et le fichier en attente sont supprimés. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async purgeExpired(): Promise<void> {
    const previews = await this.prisma.reimportPreview.findMany({
      where: { expiresAt: { lte: new Date() } },
    });
    for (const p of previews) {
      await this.prisma.reimportPreview.delete({ where: { id: p.id } }).catch(() => undefined);
      await unlink(join(config.uploadsDir, p.uploadedFilePath)).catch(() => undefined);
    }
    if (previews.length > 0) this.logger.log(`${previews.length} aperçu(s) de réimport purgé(s)`);
  }

  /**
   * Validations perdues : écrites dans cette source après le dernier
   * téléchargement, encore présentes dans la version de référence (staging), et
   * dont le nouveau fichier porte une autre valeur.
   */
  private async lostValidations(
    sourceId: string,
    lastDownloadedAt: Date | null,
    workbook: ParsedWorkbook,
  ): Promise<LostValidation[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        status: { in: [SubmissionStatus.validated, SubmissionStatus.modified] },
        ...(lastDownloadedAt ? { decidedAt: { gt: lastDownloadedAt } } : {}),
      },
      orderBy: { decidedAt: 'asc' },
    });
    const inFile = new Map<string, string | null>();
    for (const sheet of workbook.sheets) {
      for (const c of sheet.cells) {
        inFile.set(`${sheet.name}|${c.row}|${c.col}`, c.type === CellType.empty ? null : c.text);
      }
    }
    const lost: LostValidation[] = [];
    for (const s of submissions) {
      const cells = ((s.written as Written | null)?.cells ?? []).filter(
        (c) => c.sourceId === sourceId,
      );
      for (const c of cells) {
        const staged = await this.prisma.stagingCell.findUnique({
          where: { sourceId_sheet_row_col: { sourceId, sheet: c.sheet, row: c.row, col: c.col } },
        });
        const current = staged && staged.valueType !== CellType.empty ? staged.valueText : null;
        const inNewFile = inFile.get(`${c.sheet}|${c.row}|${c.col}`) ?? null;
        if (current === c.after && inNewFile !== c.after) {
          lost.push({
            submissionId: s.id,
            cell: `${c.sheet}!${cellRef(c)}`,
            validatedValue: c.after,
            valueInNewFile: inNewFile,
            validatedAt: s.decidedAt!.toISOString(),
          });
        }
      }
    }
    return lost;
  }

  /** Réécrit les validations perdues sur le nouveau staging, dans l'ordre de validation. */
  private async reapply(tx: Prisma.TransactionClient, ids: string[]): Promise<string[]> {
    const submissions = await tx.submission.findMany({
      where: { id: { in: ids } },
      include: { form: true, versionRef: true },
      orderBy: { decidedAt: 'asc' },
    });
    for (const s of submissions) {
      const written = s.written as unknown as Written;
      const def = s.versionRef.definition as unknown as FormDefinition;
      try {
        const result = await this.processor.apply(tx, s.form.mode, def, written.values, s.rowKey, {
          acceptFormulas: true,
        });
        await tx.submission.update({
          where: { id: s.id },
          data: {
            written: {
              values: written.values,
              cells: result.cells,
            } as unknown as Prisma.InputJsonValue,
            assignedRow: result.assignedRow,
          },
        });
      } catch (error) {
        if (error instanceof AppException) {
          throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, error.getBody().code, {
            submissionId: s.id,
          });
        }
        throw error;
      }
    }
    return submissions.map((s) => s.id);
  }
}
