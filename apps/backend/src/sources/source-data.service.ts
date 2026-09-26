import { Injectable } from '@nestjs/common';
import {
  type CellPosition,
  CellType,
  parseCellRef,
  type Rect,
  SourceType,
} from '@strategos/shared';
import type { Prisma, Source } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EMPTY_CELL, type StoredCell } from './cell-format.js';
import { pureExternalRef } from './excel-parser.js';

/** La source n'existe plus, est retirée ou injoignable (`SOURCE_UNAVAILABLE`). */
export class SourceUnavailableError extends Error {
  constructor(readonly sourceId: string) {
    super(`Source ${sourceId} indisponible`);
  }
}

export const positionKey = (row: number, col: number) => `${row}:${col}`;

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

/** Source lisible : non retirée, dans un état normal et d'un type déjà géré. */
function isUsable(source: Source): boolean {
  // Google Sheets et OneDrive : adaptateurs de l'étape 7.
  return source.deletedAt === null && source.status === 'ok' && source.type === SourceType.upload;
}

/**
 * Lecture des sources (08) : l'interface commune aux modules de page et,
 * plus tard, aux formulaires. Les Excel uploadés sont lus dans le staging ; les
 * Google Sheets et OneDrive s'y brancheront (étape 7) sans que les appelants
 * connaissent le type de source.
 */
@Injectable()
export class SourceDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cellules non vides d'un rectangle, par `positionKey` ; les absentes sont vides. */
  async readRect(sourceId: string, sheet: string, rect: Rect): Promise<Map<string, StoredCell>> {
    await this.usableSource(sourceId);
    return this.readStaging(sourceId, sheet, {
      row: { gte: rect.top, lte: rect.bottom },
      col: { gte: rect.left, lte: rect.right },
    });
  }

  /** Dernière ligne remplie des colonnes `left..right` à partir de `startRow` (plage extensible). */
  async lastFilledRow(
    sourceId: string,
    sheet: string,
    cols: { left: number; right: number },
    startRow: number,
  ): Promise<number | null> {
    await this.usableSource(sourceId);
    const { _max } = await this.prisma.stagingCell.aggregate({
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
      try {
        await this.usableSource(sourceId);
      } catch (error) {
        if (error instanceof SourceUnavailableError) {
          unavailable.add(sourceId);
          continue;
        }
        throw error;
      }
      const read = await this.readPositions(sourceId, sheet, group, 0);
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

  private async usableSource(sourceId: string): Promise<Source> {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source || !isUsable(source)) throw new SourceUnavailableError(sourceId);
    return source;
  }

  private async readPositions(
    sourceId: string,
    sheet: string,
    positions: CellPosition[],
    depth: number,
  ): Promise<Map<string, StoredCell>> {
    return this.readStaging(
      sourceId,
      sheet,
      { OR: positions.map(({ row, col }) => ({ row, col })) },
      depth,
    );
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
  ): Promise<Map<string, StoredCell>> {
    const rows = await this.prisma.stagingCell.findMany({ where: { sourceId, sheet, ...where } });
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

    const references = await this.prisma.cellReference.findMany({
      where: { sourceId, sheet, OR: linked },
    });
    for (const ref of references) {
      const target = parseCellRef(ref.referencedRange);
      if (!target) continue;
      try {
        await this.usableSource(ref.referencedSourceId);
      } catch (error) {
        if (error instanceof SourceUnavailableError) continue;
        throw error;
      }
      const value = (
        await this.readPositions(ref.referencedSourceId, ref.referencedSheet, [target], depth + 1)
      ).get(positionKey(target.row, target.col));
      const own = cells.get(positionKey(ref.row, ref.col))!;
      cells.set(positionKey(ref.row, ref.col), {
        ...(value ?? EMPTY_CELL),
        needsRecalc: own.needsRecalc || (value?.needsRecalc ?? false),
      });
    }
    return cells;
  }
}
