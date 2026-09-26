import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  SourceType,
  type SourceSummary,
  WarningCode,
} from '@strategos/shared';
import { fileTypeFromBuffer } from 'file-type';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { findJsonUsages } from '../common/json-usages.js';
import { config } from '../config.js';
import type { Prisma, Source } from '../generated/prisma/client.js';
import { cleanFilename } from '../media/media.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ExcelParseError,
  externalRefs,
  type ParsedWorkbook,
  parseWorkbook,
} from './excel-parser.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/** Lignes insérées par requête (Postgres limite le nombre de paramètres). */
const INSERT_CHUNK = 5_000;

/** `connection_info` d'un Excel uploadé. */
interface UploadInfo {
  storagePath: string;
  /** Feuilles, dans l'ordre du classeur (y compris les feuilles vides). */
  sheets: string[];
}

export function sheetsOf(source: Source): string[] {
  return (source.connectionInfo as Partial<UploadInfo>).sheets ?? [];
}

/**
 * Sources de données, côté admin (08, 04 — Sources). À l'étape 5 : Excel
 * uploadés (import vers le staging, téléchargement, retrait).
 */
@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<SourceSummary[]> {
    const sources = await this.prisma.source.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return Promise.all(sources.map((s) => this.summary(s)));
  }

  async get(id: string): Promise<Source> {
    const source = await this.prisma.source.findFirst({ where: { id, deletedAt: null } });
    if (!source) throw notFound();
    return source;
  }

  /**
   * Import d'un `.xlsx` : fichier sur le volume `uploads`, valeurs et formules
   * dans le staging, liaisons inter-fichiers résolues en `cell_references`.
   */
  async upload(
    file: { buffer: Buffer; originalname: string },
    actor: AuditActor & { kind: 'user' },
  ): Promise<SourceSummary> {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (detected?.ext !== 'xlsx') {
      throw new AppException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    let workbook: ParsedWorkbook;
    try {
      workbook = await parseWorkbook(file.buffer);
    } catch (error) {
      if (error instanceof ExcelParseError) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.EXCEL_PARSE_FAILED);
      }
      throw error;
    }
    const name = cleanFilename(file.originalname) || 'classeur.xlsx';

    const storagePath = join('sources', `${randomUUID()}.xlsx`);
    const absolute = join(config.uploadsDir, storagePath);
    await mkdir(join(config.uploadsDir, 'sources'), { recursive: true });
    await writeFile(absolute, file.buffer);
    try {
      const source = await this.prisma.$transaction(
        async (tx) => {
          const info: UploadInfo = { storagePath, sheets: workbook.sheets.map((s) => s.name) };
          const created = await tx.source.create({
            data: {
              type: SourceType.upload,
              name,
              connectionInfo: info as unknown as Prisma.InputJsonValue,
              lastImportedAt: new Date(),
              createdBy: actor.userId,
            },
          });
          const cells = await this.stage(tx, created.id, workbook);
          const links = await this.link(tx, created.id, workbook);
          await this.audit.record(tx, actor, {
            action: AuditAction.SOURCE_UPLOAD,
            targetType: AuditTargetType.SOURCE,
            targetId: created.id,
            after: { name, sheets: info.sheets, cells, links },
          });
          return created;
        },
        { timeout: 120_000 },
      );
      return this.summary(source);
    } catch (error) {
      await unlink(absolute).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Version de référence d'un Excel uploadé. Met à jour `last_downloaded_at`
   * (base de l'avertissement de réimport) et trace le téléchargement.
   */
  async download(id: string, actor: AuditActor): Promise<{ path: string; name: string }> {
    const source = await this.get(id);
    if (source.type !== SourceType.upload) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.SOURCE_NOT_UPLOAD);
    }
    const downloadedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.source.update({ where: { id }, data: { lastDownloadedAt: downloadedAt } });
      await this.audit.record(tx, actor, {
        action: AuditAction.SOURCE_DOWNLOAD,
        targetType: AuditTargetType.SOURCE,
        targetId: id,
        before: {
          name: source.name,
          lastDownloadedAt: source.lastDownloadedAt?.toISOString() ?? null,
        },
        after: { name: source.name, lastDownloadedAt: downloadedAt.toISOString() },
      });
    });
    const info = source.connectionInfo as unknown as UploadInfo;
    return { path: join(config.uploadsDir, info.storagePath), name: source.name };
  }

  /**
   * Retrait (suppression douce). Encore utilisée → `409 CONFIRMATION_REQUIRED`
   * avec les pages concernées ; ses modules deviennent alors indisponibles.
   */
  async remove(id: string, confirm: boolean, actor: AuditActor): Promise<void> {
    const source = await this.get(id);
    const usages = await findJsonUsages(this.prisma, id);
    if (!confirm && (usages.pages.length > 0 || usages.layouts.length > 0)) {
      throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, {
        warnings: [
          {
            code: WarningCode.SOURCE_IN_USE,
            message: 'Cette source est encore utilisée.',
            pages: usages.pages,
            layouts: usages.layouts,
          },
        ],
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.source.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.SOURCE_DELETE,
        targetType: AuditTargetType.SOURCE,
        targetId: id,
        before: { name: source.name, deleted: false },
        after: { name: source.name, deleted: true, usedBy: usages.pages.map((p) => p.name) },
      });
    });
  }

  private async summary(source: Source): Promise<SourceSummary> {
    return {
      id: source.id,
      type: source.type,
      name: source.name,
      status: source.status,
      lastReadAt: source.lastReadAt?.toISOString() ?? null,
      lastImportedAt: source.lastImportedAt?.toISOString() ?? null,
      lastDownloadedAt: source.lastDownloadedAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
      sheets: sheetsOf(source),
      usages: await findJsonUsages(this.prisma, source.id),
      version: source.version,
    };
  }

  private async stage(
    tx: Prisma.TransactionClient,
    sourceId: string,
    workbook: ParsedWorkbook,
  ): Promise<number> {
    const rows = workbook.sheets.flatMap((sheet) =>
      sheet.cells.map((c) => ({
        sourceId,
        sheet: sheet.name,
        row: c.row,
        col: c.col,
        valueType: c.type,
        valueText: c.text,
        valueNumber: c.number,
        formula: c.formula,
      })),
    );
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.stagingCell.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
    }
    return rows.length;
  }

  /**
   * Liaisons inter-fichiers (08) : le classeur lié est retrouvé parmi les
   * Excel uploadés par son nom de fichier, **une fois**, à l'import ; la liaison
   * est ensuite suivie par `source_id`, jamais par chemin. Sans source
   * correspondante, la cellule garde sa valeur stockée.
   */
  private async link(
    tx: Prisma.TransactionClient,
    sourceId: string,
    workbook: ParsedWorkbook,
  ): Promise<number> {
    if (workbook.externalBooks.size === 0) return 0;
    const candidates = await tx.source.findMany({
      where: { type: SourceType.upload, deletedAt: null, id: { not: sourceId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true },
    });
    const byBook = new Map<number, string>();
    for (const [book, filename] of workbook.externalBooks) {
      const match = candidates.find((c) => c.name.toLowerCase() === filename.toLowerCase());
      if (match) byBook.set(book, match.id);
    }
    const references = workbook.sheets.flatMap((sheet) =>
      sheet.cells.flatMap((c) =>
        c.formula
          ? externalRefs(c.formula).flatMap((ref) => {
              const referencedSourceId = byBook.get(ref.book);
              return referencedSourceId
                ? [
                    {
                      sourceId,
                      sheet: sheet.name,
                      row: c.row,
                      col: c.col,
                      referencedSourceId,
                      referencedSheet: ref.sheet,
                      referencedRange: ref.range,
                    },
                  ]
                : [];
            })
          : [],
      ),
    );
    for (let i = 0; i < references.length; i += INSERT_CHUNK) {
      await tx.cellReference.createMany({ data: references.slice(i, i + INSERT_CHUNK) });
    }
    return references.length;
  }
}
