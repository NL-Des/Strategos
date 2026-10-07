import { Injectable } from '@nestjs/common';
import { type CellPosition, CellType, parseCellRef, type Rect } from '@strategos/shared';
import type { Prisma, Source } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import { EMPTY_CELL, type StoredCell } from './cell-format.js';
import type { RemoteCell } from './connectors/cells.js';
import { isConnected, SourceConnectors } from './connectors/source-connectors.service.js';
import { pureExternalRef } from './excel-parser.js';

export {
  SourceAuthExpiredError,
  SourceUnavailableError,
  sourceException,
} from './source-errors.js';
import { SourceUnavailableError } from './source-errors.js';

export { positionKey } from './cell-format.js';
import { positionKey } from './cell-format.js';

/** Une cellule demandée par l'assemblage d'une page (Contenu libre, en-têtes). */
export interface CellNeed {
  sourceId: string;
  sheet: string;
  row: number;
  col: number;
}

export const needKey = (n: CellNeed) => `${n.sourceId}|${n.sheet}|${n.row}|${n.col}`;

/** Profondeur maximale d'une chaîne de liaisons inter-fichiers (et garde contre les boucles). */
const MAX_LINK_DEPTH = 5;

/**
 * Source lisible : non retirée ; un Excel uploadé doit être en état normal. Une
 * source connectée est toujours retentée : c'est la lecture qui dit si elle répond.
 */
function isUsable(source: Source): boolean {
  return source.deletedAt === null && (isConnected(source) || source.status === 'ok');
}

const inRect = (rect: Rect, row: number, col: number) =>
  row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;

/**
 * Lecture des sources (08) : l'interface commune aux modules de page et aux
 * formulaires. Les Excel uploadés sont lus dans le staging ; les Google Sheets
 * et OneDrive, dans leur cache mémoire (08). Les appelants ne connaissent pas
 * le type de source.
 */
@Injectable()
export class SourceDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectors: SourceConnectors,
  ) {}

  /** Cellules d'une feuille connectée qui vérifient `keep`. */
  private async remote(
    source: Source,
    sheet: string,
    keep: (row: number, col: number, cell: RemoteCell) => boolean,
  ): Promise<Map<string, RemoteCell>> {
    const cells = new Map<string, RemoteCell>();
    for (const [key, cell] of await this.connectors.sheet(source, sheet)) {
      const [row, col] = key.split(':').map(Number) as [number, number];
      if (keep(row, col, cell)) cells.set(key, cell);
    }
    return cells;
  }

  /**
   * Cellules non vides d'un rectangle, par `positionKey` ; les absentes sont vides.
   * `db` : client de la transaction d'une écriture (validation d'une soumission).
   */
  async readRect(
    sourceId: string,
    sheet: string,
    rect: Rect,
    db: Db = this.prisma,
  ): Promise<Map<string, StoredCell>> {
    const source = await this.usableSource(sourceId, db);
    if (isConnected(source))
      return this.remote(source, sheet, (row, col) => inRect(rect, row, col));
    return this.readStaging(
      sourceId,
      sheet,
      { row: { gte: rect.top, lte: rect.bottom }, col: { gte: rect.left, lte: rect.right } },
      0,
      db,
    );
  }

  /**
   * Lignes de `top..bottom` dont au moins une des colonnes `cols` est remplie
   * (valeur ou formule) : sert à trouver la première ligne vide d'une zone d'ajout.
   */
  async filledRows(
    sourceId: string,
    sheet: string,
    cols: number[],
    rows: { top: number; bottom: number },
    db: Db = this.prisma,
  ): Promise<Set<number>> {
    const source = await this.usableSource(sourceId, db);
    if (isConnected(source)) {
      const found = await this.remote(
        source,
        sheet,
        (row, col, cell) =>
          row >= rows.top &&
          row <= rows.bottom &&
          cols.includes(col) &&
          (cell.type !== CellType.empty || cell.formula !== null),
      );
      return new Set([...found.keys()].map((key) => Number(key.split(':')[0])));
    }
    const cells = await db.stagingCell.findMany({
      where: {
        sourceId,
        sheet,
        row: { gte: rows.top, lte: rows.bottom },
        col: { in: cols },
        OR: [{ valueType: { not: CellType.empty } }, { formula: { not: null } }],
      },
      select: { row: true },
      distinct: ['row'],
    });
    return new Set(cells.map((c) => c.row));
  }

  /** Dernière ligne remplie des colonnes `left..right` à partir de `startRow` (plage extensible). */
  async lastFilledRow(
    sourceId: string,
    sheet: string,
    cols: { left: number; right: number },
    startRow: number,
    db: Db = this.prisma,
  ): Promise<number | null> {
    const source = await this.usableSource(sourceId, db);
    if (isConnected(source)) {
      const found = await this.remote(
        source,
        sheet,
        (row, col, cell) =>
          row >= startRow && col >= cols.left && col <= cols.right && cell.type !== CellType.empty,
      );
      const rows = [...found.keys()].map((key) => Number(key.split(':')[0]));
      return rows.length > 0 ? Math.max(...rows) : null;
    }
    const { _max } = await db.stagingCell.aggregate({
      where: {
        sourceId,
        sheet,
        row: { gte: startRow },
        col: { gte: cols.left, lte: cols.right },
        valueType: { not: CellType.empty },
      },
      _max: { row: true },
    });
    return _max.row;
  }

  /**
   * Cellules isolées de plusieurs sources (assemblage d'une page). Une source
   * injoignable n'interrompt rien : elle est renvoyée dans `unavailable`.
   */
  async readCells(
    needs: CellNeed[],
  ): Promise<{ cells: Map<string, StoredCell>; unavailable: Set<string> }> {
    const cells = new Map<string, StoredCell>();
    const unavailable = new Set<string>();
    const groups = new Map<string, CellNeed[]>();
    for (const need of needs) {
      const key = `${need.sourceId}|${need.sheet}`;
      groups.set(key, [...(groups.get(key) ?? []), need]);
    }
    for (const group of groups.values()) {
      const { sourceId, sheet } = group[0]!;
      if (unavailable.has(sourceId)) continue;
      let read: Map<string, StoredCell>;
      try {
        const source = await this.usableSource(sourceId);
        read = await this.readPositions(source, sheet, group, 0);
      } catch (error) {
        if (error instanceof SourceUnavailableError) {
          unavailable.add(sourceId);
          continue;
        }
        throw error;
      }
      for (const need of group) {
        cells.set(needKey(need), read.get(positionKey(need.row, need.col)) ?? EMPTY_CELL);
      }
    }
    return { cells, unavailable };
  }

  /** Sources connues parmi `ids`, avec leur nom et leur disponibilité. */
  async describe(ids: string[]): Promise<Map<string, { name: string; available: boolean }>> {
    const sources = await this.prisma.source.findMany({ where: { id: { in: ids } } });
    return new Map(sources.map((s) => [s.id, { name: s.name, available: isUsable(s) }]));
  }

  /** Source lisible, sinon `SourceUnavailableError`. */
  async usableSource(sourceId: string, db: Db = this.prisma): Promise<Source> {
    const source = await db.source.findUnique({ where: { id: sourceId } });
    if (!source || !isUsable(source)) throw new SourceUnavailableError(sourceId);
    return source;
  }

  /**
   * Cellules-formules parmi `cells` (une valeur écrite remplacerait la formule),
   * ou, avec `area`, dans ces colonnes et lignes, au plus `limit`.
   */
  async formulaCells(
    db: Db,
    sourceId: string,
    sheet: string,
    where: { cells: CellPosition[] } | { cols: number[]; rows: { top: number; bottom: number } },
    limit = Number.MAX_SAFE_INTEGER,
  ): Promise<CellPosition[]> {
    const source = await this.usableSource(sourceId, db);
    const wanted =
      'cells' in where
        ? (row: number, col: number) => where.cells.some((c) => c.row === row && c.col === col)
        : (row: number, col: number) =>
            where.cols.includes(col) && row >= where.rows.top && row <= where.rows.bottom;
    if ('cells' in where && where.cells.length === 0) return [];
    if (isConnected(source)) {
      const found = await this.remote(
        source,
        sheet,
        (row, col, cell) => cell.formula !== null && wanted(row, col),
      );
      return [...found.keys()]
        .map((key) => key.split(':').map(Number) as [number, number])
        .map(([row, col]) => ({ row, col }))
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .slice(0, limit);
    }
    return db.stagingCell.findMany({
      where: {
        sourceId,
        sheet,
        formula: { not: null },
        ...('cells' in where
          ? { OR: where.cells.map(({ row, col }) => ({ row, col })) }
          : {
              col: { in: where.cols },
              row: { gte: where.rows.top, lte: Math.min(where.rows.bottom, 2_147_483_647) },
            }),
      },
      select: { row: true, col: true },
      orderBy: [{ row: 'asc' }, { col: 'asc' }],
      take: limit === Number.MAX_SAFE_INTEGER ? undefined : limit,
    });
  }

  private async readPositions(
    source: Source,
    sheet: string,
    positions: CellPosition[],
    depth: number,
    db: Db = this.prisma,
  ): Promise<Map<string, StoredCell>> {
    if (isConnected(source)) {
      return this.remote(source, sheet, (row, col) =>
        positions.some((p) => p.row === row && p.col === col),
      );
    }
    return this.readStaging(
      source.id,
      sheet,
      { OR: positions.map(({ row, col }) => ({ row, col })) },
      depth,
      db,
    );
  }

  /**
   * Grille de l'admin (04 — Sources) : cellules brutes d'un rectangle, formules
   * comprises, sans suivre les liaisons ; plus les dimensions de la feuille
   * (dernière ligne et dernière colonne non vides). Staging pour un Excel
   * uploadé, document en ligne (cache) pour un Google Sheet.
   */
  async gridWindow(source: Source, sheet: string, rect: Rect) {
    if (!isConnected(source)) return this.stagingWindow(source.id, sheet, rect);
    const all = await this.connectors.sheet(source, sheet);
    const cells: { row: number; col: number; formula: string | null; stored: StoredCell }[] = [];
    let [maxRow, maxCol] = [0, 0];
    for (const [key, { formula, ...stored }] of all) {
      const [row, col] = key.split(':').map(Number) as [number, number];
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
      if (inRect(rect, row, col)) cells.push({ row, col, formula, stored });
    }
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    return { cells, maxRow, maxCol };
  }

  private async stagingWindow(sourceId: string, sheet: string, rect: Rect) {
    const [cells, extent] = await Promise.all([
      this.prisma.stagingCell.findMany({
        where: {
          sourceId,
          sheet,
          row: { gte: rect.top, lte: rect.bottom },
          col: { gte: rect.left, lte: rect.right },
        },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      }),
      this.prisma.stagingCell.aggregate({
        where: { sourceId, sheet },
        _max: { row: true, col: true },
      }),
    ]);
    return {
      cells: cells.map((r) => ({
        row: r.row,
        col: r.col,
        formula: r.formula,
        stored: {
          type: r.valueType,
          text: r.valueText,
          number: r.valueNumber === null ? null : Number(r.valueNumber),
          needsRecalc: r.needsRecalc,
        } satisfies StoredCell,
      })),
      maxRow: extent._max.row ?? 0,
      maxCol: extent._max.col ?? 0,
    };
  }

  /**
   * Lit le staging, puis suit les liaisons : une cellule dont la formule n'est
   * qu'une référence à un autre classeur prend la valeur de la cellule liée,
   * retrouvée par `cell_references` (source, feuille, plage), jamais par chemin.
   * Si la source liée est indisponible, la valeur stockée est gardée.
   */
  private async readStaging(
    sourceId: string,
    sheet: string,
    where: Prisma.StagingCellWhereInput,
    depth = 0,
    db: Db = this.prisma,
  ): Promise<Map<string, StoredCell>> {
    const rows = await db.stagingCell.findMany({ where: { sourceId, sheet, ...where } });
    const cells = new Map<string, StoredCell>();
    const linked: { row: number; col: number }[] = [];
    for (const r of rows) {
      cells.set(positionKey(r.row, r.col), {
        type: r.valueType,
        text: r.valueText,
        number: r.valueNumber === null ? null : Number(r.valueNumber),
        needsRecalc: r.needsRecalc,
      });
      if (r.formula && pureExternalRef(r.formula)) linked.push({ row: r.row, col: r.col });
    }
    if (linked.length === 0 || depth >= MAX_LINK_DEPTH) return cells;

    const references = await db.cellReference.findMany({
      where: { sourceId, sheet, OR: linked },
    });
    for (const ref of references) {
      const target = parseCellRef(ref.referencedRange);
      if (!target) continue;
      let value: StoredCell | undefined;
      try {
        const linked = await this.usableSource(ref.referencedSourceId, db);
        value = (
          await this.readPositions(linked, ref.referencedSheet, [target], depth + 1, db)
        ).get(positionKey(target.row, target.col));
      } catch (error) {
        if (error instanceof SourceUnavailableError) continue;
        throw error;
      }
      const own = cells.get(positionKey(ref.row, ref.col))!;
      cells.set(positionKey(ref.row, ref.col), {
        ...(value ?? EMPTY_CELL),
        needsRecalc: own.needsRecalc || (value?.needsRecalc ?? false),
      });
    }
    return cells;
  }
}
