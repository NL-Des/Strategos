import { Injectable } from '@nestjs/common';
import { type CellType, parseRangeRef } from '@strategos/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Db } from '../prisma/prisma.types.js';
import { type FormulaRef, formulaRefs, rectContains } from './formula-deps.js';
import { isConnected, SourceConnectors } from './connectors/source-connectors.service.js';
import { SourceDataService } from './source-data.service.js';

/** Valeur brute écrite dans une cellule : Strategos n'écrit jamais de formule. */
export interface StoredValue {
  type: CellType;
  text: string | null;
  number: number | null;
}

export interface CellAddress {
  sheet: string;
  row: number;
  col: number;
}

export interface CellWrite extends CellAddress {
  value: StoredValue;
}

const addressKey = (sourceId: string, c: CellAddress) =>
  `${sourceId}|${c.sheet.toLowerCase()}|${c.row}|${c.col}`;

/** Cellules marquées par requête. */
const UPDATE_CHUNK = 500;

interface FormulaCell extends CellAddress {
  refs: FormulaRef[];
}

/**
 * Écriture dans les sources (08 — Points techniques) : l'unique chemin des
 * validations de soumissions. Les appelants ne savent pas de quel type est la
 * source : staging et `needs_recalc` pour un Excel uploadé, API pour une
 * source connectée (cache vidé après l'écriture).
 */
@Injectable()
export class SourceWriteService {
  constructor(
    private readonly data: SourceDataService,
    private readonly connectors: SourceConnectors,
  ) {}

  /**
   * Sérialise les écritures d'une même source jusqu'à la fin de la transaction
   * (file par `source_id`) : deux validations simultanées ne lisent ni la même
   * ligne vide, ni la même valeur de départ d'un mouvement.
   */
  async lock(tx: Prisma.TransactionClient, sourceId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sourceId}, 0))`;
    // Source connectée : la ligne vide et la valeur de départ se lisent dans le
    // document lui-même, pas dans une copie du cache (09 — Points techniques).
    this.connectors.invalidate(sourceId);
  }

  /** Parmi `cells`, celles qui contiennent une formule (elle serait écrasée). */
  async formulaCells(db: Db, sourceId: string, cells: CellAddress[]): Promise<CellAddress[]> {
    const found: CellAddress[] = [];
    for (const sheet of [...new Set(cells.map((c) => c.sheet))]) {
      const inSheet = cells.filter((c) => c.sheet === sheet);
      const formulas = await this.data.formulaCells(db, sourceId, sheet, { cells: inSheet });
      found.push(...formulas.map((c) => ({ sheet, ...c })));
    }
    return found;
  }

  /**
   * Écrit des valeurs brutes (une formule visée est remplacée par sa valeur),
   * puis marque « à recalculer » les cellules qui en dépendent, directement ou
   * transitivement, y compris dans d'autres sources via `cell_references`.
   */
  async writeCells(
    tx: Prisma.TransactionClient,
    sourceId: string,
    writes: CellWrite[],
  ): Promise<void> {
    if (writes.length === 0) return;
    const source = await this.data.usableSource(sourceId, tx);
    if (isConnected(source)) {
      // Le document en ligne fait foi : Google ou Microsoft recalculent eux-mêmes.
      try {
        await this.connectors.track(source, () =>
          this.connectors.for(source.type).write(source, writes),
        );
      } finally {
        this.connectors.invalidate(sourceId);
      }
      return;
    }
    for (const w of writes) {
      const value = {
        valueType: w.value.type,
        valueText: w.value.text,
        valueNumber: w.value.number,
        formula: null,
        needsRecalc: false,
      };
      await tx.stagingCell.upsert({
        where: { sourceId_sheet_row_col: { sourceId, sheet: w.sheet, row: w.row, col: w.col } },
        create: { sourceId, sheet: w.sheet, row: w.row, col: w.col, ...value },
        update: value,
      });
    }
    // Une liaison écrasée par une valeur n'est plus suivie.
    await tx.cellReference.deleteMany({
      where: { sourceId, OR: writes.map(({ sheet, row, col }) => ({ sheet, row, col })) },
    });
    await this.markDependents(tx, sourceId, writes);
  }

  private async markDependents(
    tx: Prisma.TransactionClient,
    sourceId: string,
    written: CellAddress[],
  ): Promise<void> {
    const formulas = new Map<string, FormulaCell[]>();
    const incoming = new Map<string, Awaited<ReturnType<typeof tx.cellReference.findMany>>>();
    const marked = new Map<string, { sourceId: string; cell: CellAddress }>();
    const seen = new Set(written.map((c) => addressKey(sourceId, c)));
    let frontier: { sourceId: string; cells: CellAddress[] }[] = [{ sourceId, cells: written }];

    while (frontier.length > 0) {
      const next = new Map<string, CellAddress[]>();
      const reach = (src: string, cell: CellAddress) => {
        const key = addressKey(src, cell);
        if (seen.has(key)) return;
        seen.add(key);
        marked.set(key, { sourceId: src, cell });
        next.set(src, [...(next.get(src) ?? []), cell]);
      };
      for (const { sourceId: src, cells } of frontier) {
        if (!formulas.has(src)) formulas.set(src, await this.loadFormulas(tx, src));
        if (!incoming.has(src)) {
          incoming.set(
            src,
            await tx.cellReference.findMany({ where: { referencedSourceId: src } }),
          );
        }
        const hits = (sheet: string, test: (c: CellAddress) => boolean) =>
          cells.some((c) => c.sheet.toLowerCase() === sheet.toLowerCase() && test(c));
        for (const f of formulas.get(src)!) {
          if (f.refs.some((r) => hits(r.sheet, (c) => rectContains(r.rect, c.row, c.col)))) {
            reach(src, f);
          }
        }
        for (const ref of incoming.get(src)!) {
          const rect = parseRangeRef(ref.referencedRange);
          if (rect && hits(ref.referencedSheet, (c) => rectContains(rect, c.row, c.col))) {
            reach(ref.sourceId, { sheet: ref.sheet, row: ref.row, col: ref.col });
          }
        }
      }
      frontier = [...next].map(([src, cells]) => ({ sourceId: src, cells }));
    }

    const bySource = new Map<string, CellAddress[]>();
    for (const { sourceId: src, cell } of marked.values()) {
      bySource.set(src, [...(bySource.get(src) ?? []), cell]);
    }
    for (const [src, cells] of bySource) {
      for (let i = 0; i < cells.length; i += UPDATE_CHUNK) {
        await tx.stagingCell.updateMany({
          where: {
            sourceId: src,
            OR: cells
              .slice(i, i + UPDATE_CHUNK)
              .map(({ sheet, row, col }) => ({ sheet, row, col })),
          },
          data: { needsRecalc: true },
        });
      }
    }
  }

  private async loadFormulas(tx: Prisma.TransactionClient, sourceId: string) {
    const cells = await tx.stagingCell.findMany({
      where: { sourceId, formula: { not: null } },
      select: { sheet: true, row: true, col: true, formula: true },
    });
    return cells.map((c) => ({
      sheet: c.sheet,
      row: c.row,
      col: c.col,
      refs: formulaRefs(c.formula!, c.sheet),
    }));
  }
}
