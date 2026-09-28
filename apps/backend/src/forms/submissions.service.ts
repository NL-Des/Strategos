import { HttpStatus, Injectable } from '@nestjs/common';
import {
  cellRef,
  ErrorCode,
  type FormDefinition,
  type Paginated,
  type Submission as SubmissionDto,
  type SubmissionQueueItem,
  SubmissionStatus,
  type SubmissionTarget,
  type SubmissionValues,
  type Warning,
} from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { FormVersion, Prisma, Submission } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMPTY_CELL, formatText } from '../sources/cell-format.js';
import {
  positionKey,
  SourceDataService,
  SourceUnavailableError,
} from '../sources/source-data.service.js';
import { type CellAddress, SourceWriteService } from '../sources/source-write.service.js';
import { FormDataService } from './form-data.service.js';
import { fieldTarget } from './form-definition.js';
import type { SubmissionsQueryDto } from './forms.dto.js';
import { type FormWithVersion, publishedOf } from './forms.service.js';
import type { Written } from './submission-processor.service.js';

type WithVersion = Submission & { versionRef: FormVersion };

export function toSubmission(s: WithVersion): SubmissionDto {
  const def = s.versionRef.definition as unknown as FormDefinition;
  return {
    id: s.id,
    formId: s.formId,
    formTitle: def.title,
    status: s.status,
    submittedAt: s.createdAt.toISOString(),
    decidedAt: s.decidedAt?.toISOString() ?? null,
    values: s.values as SubmissionValues,
    rowKey: s.rowKey,
    reason: s.reason,
  };
}

/**
 * Lecture des soumissions : « mes soumissions » pour l'auteur, file et
 * compteur pour l'admin (04 — Tableau de bord des soumissions).
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: SourceDataService,
    private readonly writer: SourceWriteService,
    private readonly formData: FormDataService,
  ) {}

  async mine(userId: string, page: number, pageSize: number): Promise<Paginated<SubmissionDto>> {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        include: { versionRef: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.submission.count({ where }),
    ]);
    return { items: items.map(toSubmission), total, page, pageSize };
  }

  /** Une de ses soumissions ; celle d'un autre → `404`. */
  async mineOne(userId: string, id: string): Promise<SubmissionDto> {
    const s = await this.prisma.submission.findFirst({
      where: { id, userId },
      include: { versionRef: true },
    });
    if (!s) throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    return toSubmission(s);
  }

  async one(id: string): Promise<SubmissionDto> {
    const s = await this.prisma.submission.findUnique({
      where: { id },
      include: { versionRef: true },
    });
    if (!s) throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    return toSubmission(s);
  }

  pendingCount(): Promise<number> {
    return this.prisma.submission.count({ where: { status: SubmissionStatus.pending } });
  }

  /** File paginée, avec les cellules visées, leur valeur actuelle et les conflits. */
  async queue(query: SubmissionsQueryDto): Promise<Paginated<SubmissionQueueItem>> {
    const where: Prisma.SubmissionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.formId ? { formId: query.formId } : {}),
      ...(query.pageId ? { form: { pageId: query.pageId } } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        include: { versionRef: true, user: true, form: { include: { published: true } } },
        orderBy: { createdAt: query.sort === 'createdAt:desc' ? 'desc' : 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.submission.count({ where }),
    ]);
    const conflicts = await this.conflicts(
      rows.filter((r) => r.status === 'pending').map((r) => r.id),
    );
    const items: SubmissionQueueItem[] = [];
    for (const row of rows) {
      const { targets, warnings } = await this.targets(row, row.form);
      const def = publishedOf(row.form) ?? (row.versionRef.definition as unknown as FormDefinition);
      items.push({
        submission: toSubmission(row),
        user: { id: row.user.id, username: row.user.username },
        form: { id: row.form.id, title: def.title, mode: row.form.mode, pageId: row.form.pageId },
        targets,
        conflicts: conflicts.get(row.id) ?? [],
        warnings,
      });
    }
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Autres soumissions en attente dont les cellules visées recouvrent celles de chacune. */
  private async conflicts(ids: string[]): Promise<Map<string, string[]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: string; others: string[] }[]>`
      SELECT a.id, array_agg(b.id::text ORDER BY b.created_at) AS others
      FROM submissions a
      JOIN submissions b
        ON b.id <> a.id AND b.status = 'pending' AND a.conflict_keys && b.conflict_keys
      WHERE a.id = ANY(${ids}::uuid[])
      GROUP BY a.id`;
    return new Map(rows.map((r) => [r.id, r.others]));
  }

  /**
   * Cellules visées : écrites (soumission décidée) ou prévues (en attente).
   * La ligne d'un ajout n'est connue qu'à la validation ; `currentValue` est lue
   * maintenant et peut avoir changé au moment de valider.
   */
  private async targets(
    s: Submission,
    form: FormWithVersion,
  ): Promise<{ targets: SubmissionTarget[]; warnings: Warning[] }> {
    const values = s.values as SubmissionValues;
    const written = s.written as Written | null;
    const def = publishedOf(form);
    if (written) {
      return {
        targets: written.cells.map((c) => ({
          field: c.field,
          sourceId: c.sourceId,
          sheet: c.sheet,
          cell: cellRef(c),
          currentValue: c.after,
          proposed: written.values[c.field] ?? null,
          movement: c.movement !== undefined,
        })),
        warnings: [],
      };
    }
    if (!def?.sourceId || !def.sheet) return { targets: [], warnings: [] };

    let row: number | undefined;
    let error: ErrorCode | undefined;
    try {
      if (form.mode === 'ligne') {
        const rows = await this.formData.keyRows(def, s.rowKey ?? '');
        if (rows.length === 1) row = rows[0];
        else error = rows.length === 0 ? ErrorCode.ROW_KEY_NOT_FOUND : ErrorCode.ROW_KEY_DUPLICATE;
      }
    } catch (e) {
      if (!(e instanceof SourceUnavailableError)) throw e;
      error = ErrorCode.SOURCE_UNAVAILABLE;
    }
    const known = form.mode === 'modification' || row !== undefined;
    const fields = def.fields.filter((f) => (values[f.key] ?? null) !== null);
    const cells = new Map<string, CellAddress>();
    if (known) for (const f of fields) cells.set(f.key, fieldTarget(def, f, row));

    let current = new Map<string, string>();
    let warnings: Warning[] = [];
    if (cells.size > 0 && !error) {
      try {
        const list = [...cells.values()];
        const read = await this.data.readRect(def.sourceId, def.sheet, {
          top: Math.min(...list.map((c) => c.row)),
          bottom: Math.max(...list.map((c) => c.row)),
          left: Math.min(...list.map((c) => c.col)),
          right: Math.max(...list.map((c) => c.col)),
        });
        current = new Map(
          [...cells].map(([key, c]) => [
            key,
            formatText(read.get(positionKey(c.row, c.col)) ?? EMPTY_CELL, 'text'),
          ]),
        );
        warnings = this.formData.formulaWarning(
          await this.writer.formulaCells(this.prisma, def.sourceId, list),
        );
      } catch (e) {
        if (!(e instanceof SourceUnavailableError)) throw e;
        error = ErrorCode.SOURCE_UNAVAILABLE;
      }
    }
    return {
      targets: fields.map((f) => {
        const c = cells.get(f.key);
        return {
          field: f.key,
          sourceId: def.sourceId!,
          sheet: def.sheet!,
          cell: c ? cellRef(c) : null,
          currentValue: current.get(f.key) ?? null,
          proposed: values[f.key] ?? null,
          movement: !!f.movement,
          ...(error ? { error } : {}),
        };
      }),
      warnings,
    };
  }
}
