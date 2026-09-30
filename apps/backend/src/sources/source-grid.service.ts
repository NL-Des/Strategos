import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  type CellEditInput,
  CellType,
  ErrorCode,
  type GridCell,
  type SourceGrid,
  SourceType,
  cellRef,
  parseCellInput,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, Source, StagingCell } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatText, type StoredCell } from './cell-format.js';
import { externalRefs } from './excel-parser.js';
import { type CellAddress, SourceWriteService } from './source-write.service.js';
import { SourceDataService } from './source-data.service.js';
import { SourcesService, sheetsOf } from './sources.service.js';

export interface GridWindow {
  sheet?: string;
  top: number;
  left: number;
  rows: number;
  cols: number;
}

/** Contenu d'une cellule avant ou après une modification (`source_cell_edits`). */
export interface CellSnapshot {
  type: CellType;
  text: string | null;
  number: number | null;
  formula: string | null;
}

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

export function snapshotOf(cell: StagingCell | null): CellSnapshot {
  if (!cell) return { type: CellType.empty, text: null, number: null, formula: null };
  return {
    type: cell.valueType,
    text: cell.valueText,
    number: cell.valueNumber === null ? null : Number(cell.valueNumber),
    formula: cell.formula,
  };
}

const storedOf = (s: CellSnapshot, needsRecalc: boolean): StoredCell => ({
  type: s.type,
  text: s.text,
  number: s.number,
  needsRecalc,
});

/**
 * Grille d'un Excel uploadé, réservée à l'admin (04 — Sources) : la copie de
 * référence (staging) vue et modifiée comme un tableur. Une modification passe
 * par `SourceWriteService` (file par source, `needs_recalc`), comme une
 * validation, et est gardée dans `source_cell_edits` pour le réimport. Les
 * sources connectées se consultent et se modifient dans leur outil natif.
 */
@Injectable()
export class SourceGridService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sources: SourcesService,
    private readonly data: SourceDataService,
    private readonly writer: SourceWriteService,
  ) {}

  /** Excel uploadé et feuille existante ; sinon `404`. */
  private async sheetOf(sourceId: string, sheet?: string): Promise<[Source, string, string[]]> {
    const source = await this.sources.get(sourceId);
    if (source.type !== SourceType.upload) throw notFound();
    const sheets = sheetsOf(source);
    const name = sheet ?? sheets[0];
    if (name === undefined || !sheets.includes(name)) throw notFound();
    return [source, name, sheets];
  }

  async window(sourceId: string, w: GridWindow): Promise<SourceGrid> {
    const [, sheet, sheets] = await this.sheetOf(sourceId, w.sheet);
    const { cells, maxRow, maxCol } = await this.data.stagingWindow(sourceId, sheet, {
      top: w.top,
      left: w.left,
      bottom: w.top + w.rows - 1,
      right: w.left + w.cols - 1,
    });
    return {
      sheets,
      sheet,
      maxRow,
      maxCol,
      top: w.top,
      left: w.left,
      rows: w.rows,
      cols: w.cols,
      cells: cells.map((c) => ({
        row: c.row,
        col: c.col,
        type: c.stored.type,
        display: formatText(c.stored, 'text'),
        formula: c.formula,
        needsRecalc: c.stored.needsRecalc,
      })),
    };
  }

  /**
   * Modification d'une cellule par l'admin. Une formule n'est pas calculée :
   * la cellule garde la valeur de l'ancienne formule (vide s'il n'y en avait
   * pas) et passe « à recalculer », comme ses dépendantes.
   */
  async edit(sourceId: string, input: CellEditInput, actor: AuditActor): Promise<GridCell> {
    const [source, sheet] = await this.sheetOf(sourceId, input.sheet);
    const parsed = parseCellInput(input.input);
    if (parsed.formula !== null && externalRefs(parsed.formula).length > 0) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.FORMULA_EXTERNAL_REF);
    }
    const cell: CellAddress = { sheet, row: input.row, col: input.col };
    return this.prisma.$transaction(async (tx) => {
      await this.writer.lock(tx, sourceId);
      const current = await this.stagedCell(tx, sourceId, cell);
      const before = snapshotOf(current);
      const seen = formatText(storedOf(before, false), 'text');
      if (seen !== input.expected.display || before.formula !== (input.expected.formula ?? null)) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
      }
      const after: CellSnapshot =
        parsed.formula === null
          ? { ...parsed, formula: null }
          : before.formula !== null
            ? { ...before, formula: parsed.formula }
            : { type: CellType.empty, text: null, number: null, formula: parsed.formula };
      await this.apply(tx, sourceId, cell, after);
      await tx.sourceCellEdit.create({
        data: {
          sourceId,
          ...cell,
          before: before as unknown as Prisma.InputJsonValue,
          after: after as unknown as Prisma.InputJsonValue,
          createdBy: (actor as AuditActor & { kind: 'user' }).userId,
        },
      });
      const address = `${sheet}!${cellRef(cell)}`;
      await this.audit.record(tx, actor, {
        action: AuditAction.SOURCE_EDIT_CELL,
        targetType: AuditTargetType.SOURCE,
        targetId: sourceId,
        before: { name: source.name, cell: address, ...before },
        after: { name: source.name, cell: address, ...after },
      });
      const written = snapshotOf(await this.stagedCell(tx, sourceId, cell));
      const needsRecalc = after.formula !== null;
      return {
        row: cell.row,
        col: cell.col,
        type: written.type,
        display: formatText(storedOf(written, needsRecalc), 'text'),
        formula: written.formula,
        needsRecalc,
      };
    });
  }

  /**
   * Écrit `after` dans le staging (dans la file de la source, déjà prise) :
   * sert à la modification et à sa réapplication après un réimport.
   */
  async apply(
    tx: Prisma.TransactionClient,
    sourceId: string,
    cell: CellAddress,
    after: CellSnapshot,
  ): Promise<void> {
    await this.writer.writeCells(tx, sourceId, [
      {
        ...cell,
        value: { type: after.type, text: after.text, number: after.number },
        formula: after.formula,
      },
    ]);
  }

  private stagedCell(tx: Prisma.TransactionClient, sourceId: string, c: CellAddress) {
    return tx.stagingCell.findUnique({
      where: { sourceId_sheet_row_col: { sourceId, sheet: c.sheet, row: c.row, col: c.col } },
    });
  }
}
