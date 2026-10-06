import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AddSourceInput,
  AuditAction,
  AuditTargetType,
  CellType,
  ErrorCode,
  SourceType,
  type SourceScript,
  type SourceSummary,
  spreadsheetIdFromUrl,
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
import type { GsheetScriptInfo } from './connectors/gsheet-script.connector.js';
import { SCRIPT_VERSION, scriptSource } from './connectors/gsheet-script.template.js';
import { OneDriveConnector } from './connectors/onedrive.connector.js';
import {
  isConnected,
  isWritable,
  SourceConnectors,
} from './connectors/source-connectors.service.js';
import { decryptToken, encryptToken } from './connectors/token-crypto.js';
import { SourceUnavailableError, sourceException } from './source-errors.js';
import {
  ExcelParseError,
  externalRefs,
  type ParsedCell,
  type ParsedWorkbook,
  parseWorkbook,
} from './excel-parser.js';
import type { CellWrite } from './source-write.service.js';
import { patchWorkbook } from './xlsx-patch.js';

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
    private readonly connectors: SourceConnectors,
    private readonly onedrive: OneDriveConnector,
  ) {}

  /**
   * Ajoute un Google Sheet choisi dans le sélecteur de Google ou un fichier du
   * OneDrive connecté, après un test d'accès : un Sheet que l'admin n'a pas
   * choisi est refusé (`SOURCE_UNAVAILABLE`). Le nom et les feuilles viennent
   * du document. Un Sheet déjà ajouté est retesté, pas dupliqué : le choisir
   * de nouveau lui rend l'accès après un changement de compte Google.
   *
   * Un Google Sheet partagé par lien public s'ajoute par son lien, sans compte
   * Google, après confirmation (`SOURCE_PUBLIC_LINK`) ; il est en lecture seule.
   *
   * Un Google Sheet relié par un script s'ajoute par l'adresse de son
   * déploiement et le secret du script préparé par `newScript` ; le secret est
   * gardé chiffré.
   */
  async add(input: AddSourceInput, actor: AuditActor & { kind: 'user' }): Promise<SourceSummary> {
    let connectionInfo: Record<string, string>;
    let connectionSecret: Uint8Array<ArrayBuffer> | undefined;
    if (input.type === SourceType.gsheet || input.type === SourceType.gsheet_link) {
      const spreadsheetId =
        input.type === SourceType.gsheet ? input.spreadsheetId : spreadsheetIdFromUrl(input.url);
      if (!spreadsheetId) {
        throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
          fields: { url: ['isSheetLink'] },
        });
      }
      const existing = await this.prisma.source.findFirst({
        where: {
          type: input.type,
          deletedAt: null,
          connectionInfo: { path: ['spreadsheetId'], equals: spreadsheetId },
        },
      });
      if (existing) return this.test(existing.id);
      if (input.type === SourceType.gsheet_link && !input.confirm) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, {
          warnings: [
            {
              code: WarningCode.SOURCE_PUBLIC_LINK,
              message: 'Ce Sheet est lisible par toute personne qui a son lien.',
            },
          ],
        });
      }
      connectionInfo = { spreadsheetId };
    } else if (input.type === SourceType.gsheet_script) {
      const existing = await this.prisma.source.findFirst({
        where: {
          type: SourceType.gsheet_script,
          deletedAt: null,
          connectionInfo: { path: ['scriptUrl'], equals: input.scriptUrl },
        },
      });
      if (existing) return this.test(existing.id);
      connectionInfo = { scriptUrl: input.scriptUrl };
      connectionSecret = encryptToken(config.tokenEncryptionKey, input.secret);
    } else {
      const { driveId, itemId } = await this.remote(() => this.onedrive.locate(input.itemId));
      connectionInfo = { driveId, itemId };
    }
    const meta = await this.remote(() =>
      this.connectors.for(input.type).metadata({ id: 'new', connectionInfo, connectionSecret }),
    );
    const source = await this.prisma.$transaction(async (tx) => {
      const created = await tx.source.create({
        data: {
          type: input.type,
          name: meta.name,
          connectionInfo: {
            ...connectionInfo,
            ...meta.info,
            sheets: meta.sheets,
          } as Prisma.InputJsonValue,
          connectionSecret,
          lastReadAt: new Date(),
          createdBy: actor.userId,
        },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.SOURCE_ADD,
        targetType: AuditTargetType.SOURCE,
        targetId: created.id,
        after: { type: input.type, name: meta.name, sheets: meta.sheets },
      });
      return created;
    });
    return this.summary(source);
  }

  /**
   * Test d'accès : l'état de la source est mis à jour ; injoignable →
   * `SOURCE_UNAVAILABLE` (ou `SOURCE_AUTH_EXPIRED`). Les feuilles sont relues.
   */
  async test(id: string): Promise<SourceSummary> {
    const source = await this.get(id);
    if (!isConnected(source)) return this.summary(source);
    const meta = await this.remote(() =>
      this.connectors.track(source, () => this.connectors.for(source.type).metadata(source)),
    );
    this.connectors.invalidate(id);
    const updated = await this.prisma.source.update({
      where: { id },
      data: {
        connectionInfo: {
          ...(source.connectionInfo as object),
          ...meta.info,
          sheets: meta.sheets,
        } as Prisma.InputJsonValue,
      },
    });
    return this.summary(updated);
  }

  /** Script à coller dans un Sheet, avec un secret neuf ; rien n'est enregistré avant l'ajout. */
  newScript(): SourceScript {
    const secret = randomBytes(32).toString('base64url');
    return { script: scriptSource(secret), secret };
  }

  /** Script à jour d'un Google Sheet déjà relié, avec son secret : pour le recoller dans le Sheet. */
  async script(id: string): Promise<SourceScript> {
    const source = await this.get(id);
    if (source.type !== SourceType.gsheet_script || !source.connectionSecret) throw notFound();
    try {
      const secret = decryptToken(config.tokenEncryptionKey, source.connectionSecret);
      return { script: scriptSource(secret) };
    } catch {
      // Clé de chiffrement perdue : le secret est illisible, la source est à relier de nouveau.
      throw sourceException(new SourceUnavailableError(id));
    }
  }

  /** Appel à une source connectée ; injoignable → `503` avec son code. */
  private async remote<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof SourceUnavailableError) throw sourceException(error);
      throw error;
    }
  }

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
    const workbook = await this.readWorkbook(file.buffer);
    const name = cleanFilename(file.originalname) || 'classeur.xlsx';
    const storagePath = await this.storeFile(file.buffer);
    const absolute = join(config.uploadsDir, storagePath);
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

  /** Classeur `.xlsx` uploadé : `415` si ce n'en est pas un, `422 EXCEL_PARSE_FAILED` s'il est illisible. */
  async readWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
    const detected = await fileTypeFromBuffer(buffer);
    if (detected?.ext !== 'xlsx') {
      throw new AppException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    try {
      return await parseWorkbook(buffer);
    } catch (error) {
      if (error instanceof ExcelParseError) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.EXCEL_PARSE_FAILED);
      }
      throw error;
    }
  }

  /** Fichier d'un Excel uploadé sur le volume `uploads` ; renvoie son chemin relatif. */
  async storeFile(buffer: Buffer): Promise<string> {
    const storagePath = join('sources', `${randomUUID()}.xlsx`);
    await mkdir(join(config.uploadsDir, 'sources'), { recursive: true });
    await writeFile(join(config.uploadsDir, storagePath), buffer);
    return storagePath;
  }

  /**
   * Réimport (08) : le staging et les liaisons de la source sont remplacés par
   * ceux du nouveau fichier, dans la transaction de l'appelant. Renvoie le
   * chemin de l'ancien fichier, à supprimer après la validation de la transaction.
   */
  async restage(
    tx: Prisma.TransactionClient,
    source: Source,
    workbook: ParsedWorkbook,
    storagePath: string,
  ): Promise<{ oldPath: string; cells: number; links: number }> {
    const old = source.connectionInfo as unknown as UploadInfo;
    await tx.stagingCell.deleteMany({ where: { sourceId: source.id } });
    await tx.cellReference.deleteMany({ where: { sourceId: source.id } });
    const cells = await this.stage(tx, source.id, workbook);
    const links = await this.link(tx, source.id, workbook);
    const info: UploadInfo = { storagePath, sheets: workbook.sheets.map((s) => s.name) };
    await tx.source.update({
      where: { id: source.id },
      data: {
        connectionInfo: info as unknown as Prisma.InputJsonValue,
        lastImportedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return { oldPath: old.storagePath, cells, links };
  }

  /**
   * Version de référence d'un Excel uploadé : le fichier importé, où sont
   * reportées les valeurs écrites depuis (validations). Met à jour
   * `last_downloaded_at` (base de l'avertissement de réimport) et trace le
   * téléchargement.
   */
  async download(id: string, actor: AuditActor): Promise<{ content: Buffer; name: string }> {
    const source = await this.get(id);
    if (source.type !== SourceType.upload) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.SOURCE_NOT_UPLOAD);
    }
    const info = source.connectionInfo as unknown as UploadInfo;
    const original = await readFile(join(config.uploadsDir, info.storagePath));
    const book = await parseWorkbook(original);
    const written = await this.writtenSinceImport(id, book);
    const formulas = new Map(
      book.sheets.flatMap((sheet) =>
        sheet.cells.map((c) => [`${sheet.name}|${c.row}|${c.col}`, c.formula] as const),
      ),
    );
    // Rien d'écrit depuis l'import : le fichier est rendu tel quel.
    const content =
      written.length === 0
        ? original
        : patchWorkbook(
            original,
            written,
            (sheet, row, col) => formulas.get(`${sheet}|${row}|${col}`) ?? undefined,
          );
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
    return { content, name: source.name };
  }

  /**
   * Cellules du staging qui diffèrent du fichier importé : valeurs écrites par
   * les validations, valeurs et formules modifiées par l'admin dans la grille,
   * à reporter dans la version téléchargée.
   */
  private async writtenSinceImport(sourceId: string, book: ParsedWorkbook): Promise<CellWrite[]> {
    const inFile = new Map<string, ParsedCell>();
    for (const sheet of book.sheets) {
      for (const c of sheet.cells) inFile.set(`${sheet.name}|${c.row}|${c.col}`, c);
    }
    const staged = await this.prisma.stagingCell.findMany({ where: { sourceId } });
    return staged.flatMap((c) => {
      const f = inFile.get(`${c.sheet}|${c.row}|${c.col}`);
      const number = c.valueNumber === null ? null : Number(c.valueNumber);
      // Une formule du fichier garde sa valeur calculée par Excel : seule la formule compte.
      const same =
        c.formula !== null
          ? f?.formula === c.formula
          : f
            ? f.formula === null &&
              f.type === c.valueType &&
              f.text === c.valueText &&
              f.number === number
            : c.valueType === CellType.empty;
      return same
        ? []
        : [
            {
              sheet: c.sheet,
              row: c.row,
              col: c.col,
              value: { type: c.valueType, text: c.valueText, number },
              formula: c.formula,
            },
          ];
    });
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
      writable: isWritable(source),
      scriptOutdated:
        source.type === SourceType.gsheet_script &&
        ((source.connectionInfo as unknown as GsheetScriptInfo).scriptVersion ?? 0) <
          SCRIPT_VERSION,
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
