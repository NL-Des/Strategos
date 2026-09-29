import { Injectable } from '@nestjs/common';
import {
  type Block,
  columnNumber,
  cellRef,
  type FormDefinition,
  type FormMode,
  type PageConfig,
  parseRangeRef,
  type Row,
  type SubmissionValues,
  type Warning,
  WarningCode,
} from '@strategos/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import { EMPTY_CELL, formatText } from '../sources/cell-format.js';
import { positionKey, SourceDataService } from '../sources/source-data.service.js';
import { type CellAddress, SourceWriteService } from '../sources/source-write.service.js';
import { addZone, fieldTarget, mappedColumns, prefillValue } from './form-definition.js';

/** Cellules citées dans un avertissement, au plus. */
const MAX_WARNING_CELLS = 20;

const cellLabel = (c: CellAddress) => `${c.sheet}!${cellRef(c)}`;

function blocksOf(rows: Row[] | null | undefined): Block[] {
  return (rows ?? []).flatMap((r) => r.columns.flatMap((c) => (c.block ? [c.block] : [])));
}

export function pageBlocks(config: PageConfig | null): Block[] {
  return config ? [...blocksOf(config.zones.main), ...blocksOf(config.zones.sidebar)] : [];
}

/**
 * Lectures de source propres aux formulaires (09) : options de listes, ligne
 * d'une clé, première ligne vide d'une zone d'ajout, avertissements. Tout passe
 * par `SourceDataService`, qui ne dit pas de quel type est la source.
 */
@Injectable()
export class FormDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: SourceDataService,
    private readonly writer: SourceWriteService,
  ) {}

  /** Options des listes déroulantes, saisies ou lues dans une plage (valeurs non vides, sans doublon). */
  async options(def: FormDefinition): Promise<Map<string, string[]>> {
    const options = new Map<string, string[]>();
    for (const f of def.fields) {
      if (f.type !== 'select' || !f.options) continue;
      if (f.options.kind === 'list') {
        options.set(f.key, f.options.values ?? []);
        continue;
      }
      const rect = parseRangeRef(f.options.range ?? '');
      if (!rect || !f.options.sourceId || !f.options.sheet) continue;
      const cells = await this.data.readRect(f.options.sourceId, f.options.sheet, rect);
      const values: string[] = [];
      for (let row = rect.top; row <= rect.bottom; row++) {
        for (let col = rect.left; col <= rect.right; col++) {
          const text = formatText(cells.get(positionKey(row, col)) ?? EMPTY_CELL, 'text').trim();
          if (text && !values.includes(text)) values.push(text);
        }
      }
      options.set(f.key, values);
    }
    return options;
  }

  /** Plage de lignes d'un formulaire de ligne ; sans fin, jusqu'à la dernière ligne remplie de la clé. */
  private async lineRows(def: FormDefinition, db: Db): Promise<{ top: number; bottom: number }> {
    const top = def.rowStart ?? 1;
    if (def.rowEnd) return { top, bottom: def.rowEnd };
    const key = columnNumber(def.keyCol!);
    const last = await this.data.lastFilledRow(
      def.sourceId!,
      def.sheet!,
      { left: key, right: key },
      top,
      db,
    );
    return { top, bottom: last ?? top - 1 };
  }

  /** Lignes dont la clé vaut `rowKey` (texte affiché, espaces ignorés). */
  async keyRows(def: FormDefinition, rowKey: string, db: Db = this.prisma): Promise<number[]> {
    const rows = await this.lineRows(def, db);
    if (rows.bottom < rows.top) return [];
    const col = columnNumber(def.keyCol!);
    const cells = await this.data.readRect(
      def.sourceId!,
      def.sheet!,
      { ...rows, left: col, right: col },
      db,
    );
    const wanted = rowKey.trim();
    const found: number[] = [];
    for (const [key, cell] of cells) {
      if (formatText(cell, 'text').trim() === wanted) found.push(Number(key.split(':')[0]));
    }
    return found.sort((a, b) => a - b);
  }

  /** Valeurs actuelles d'une ligne, pour pré-remplir un formulaire de ligne. */
  async rowValues(def: FormDefinition, row: number): Promise<SubmissionValues> {
    const cols = mappedColumns(def);
    const cells = await this.data.readRect(def.sourceId!, def.sheet!, {
      top: row,
      bottom: row,
      left: Math.min(...cols),
      right: Math.max(...cols),
    });
    const values: SubmissionValues = {};
    for (const f of def.fields) {
      const target = fieldTarget(def, f, row);
      values[f.key] = prefillValue(f, cells.get(positionKey(row, target.col)) ?? EMPTY_CELL);
    }
    return values;
  }

  /**
   * Première ligne vide de la zone d'ajout (toutes les colonnes mappées vides),
   * ou `null` si la zone est pleine. Une ligne remplie à la main n'est jamais prise.
   */
  async freeRow(def: FormDefinition, db: Db = this.prisma): Promise<number | null> {
    const zone = addZone(def);
    const filled = await this.data.filledRows(
      def.sourceId!,
      def.sheet!,
      mappedColumns(def),
      zone,
      db,
    );
    for (let row = zone.top; row <= zone.bottom; row++) if (!filled.has(row)) return row;
    return null;
  }

  /** Cellules-formules que le formulaire peut écraser (avertissement à l'admin). */
  async formulaTargets(mode: FormMode, def: FormDefinition): Promise<CellAddress[]> {
    if (!def.sourceId || !def.sheet) return [];
    if (mode === 'modification') {
      const cells = def.fields.filter((f) => f.cell).map((f) => fieldTarget(def, f));
      return this.writer.formulaCells(this.prisma, def.sourceId, cells);
    }
    const cols = mappedColumns(def);
    if (cols.length === 0) return [];
    const rows =
      mode === 'ajout'
        ? addZone(def)
        : { top: def.rowStart ?? 1, bottom: def.rowEnd ?? Number.MAX_SAFE_INTEGER };
    const sheet = def.sheet;
    const cells = await this.data.formulaCells(
      this.prisma,
      def.sourceId,
      sheet,
      { cols, rows },
      MAX_WARNING_CELLS,
    );
    return cells.map((c) => ({ sheet, ...c }));
  }

  formulaWarning(cells: CellAddress[]): Warning[] {
    if (cells.length === 0) return [];
    return [
      {
        code: WarningCode.FORMULA_CELL_TARGETED,
        message: 'Une cellule visée contient une formule : elle sera remplacée par une valeur.',
        cells: cells.slice(0, MAX_WARNING_CELLS).map(cellLabel),
      },
    ];
  }

  /**
   * Tableaux et Catalogues à plage fixe qui ne couvrent pas la zone d'un
   * formulaire d'ajout de la même source et feuille (06 — Plage des tableaux).
   */
  async zoneCoverageWarnings(
    forms: { title: string; def: FormDefinition }[],
    pages: { id: string; name: string; config: PageConfig | null }[],
  ): Promise<Warning[]> {
    const uncovered: { form: string; page: string }[] = [];
    for (const form of forms) {
      if (!form.def.sourceId || !form.def.sheet || !form.def.startRow || !form.def.maxNewRows) {
        continue;
      }
      const zone = addZone(form.def);
      for (const page of pages) {
        for (const block of pageBlocks(page.config)) {
          if (block.type !== 'table' && block.type !== 'catalog') continue;
          const c = block.config;
          if (c.sourceId !== form.def.sourceId || c.sheet !== form.def.sheet) continue;
          if (c.range?.mode !== 'fixed') continue;
          const rect = parseRangeRef(c.range.ref ?? '');
          if (rect && (rect.top > zone.top || rect.bottom < zone.bottom)) {
            uncovered.push({ form: form.title, page: page.name });
          }
        }
      }
    }
    if (uncovered.length === 0) return [];
    return [
      {
        code: WarningCode.ADD_ZONE_NOT_COVERED,
        message: 'Un tableau à plage fixe ne couvre pas la zone d’un formulaire d’ajout.',
        items: uncovered,
      },
    ];
  }

  /** Pages dont le brouillon cite la source (pour l'avertissement de couverture). */
  async pagesUsingSource(sourceId: string) {
    return this.prisma.$queryRaw<{ id: string; name: string; config: PageConfig }[]>`
      SELECT id, name, draft_config AS config FROM pages
      WHERE deleted_at IS NULL AND draft_config::text LIKE ${`%${sourceId}%`}
      ORDER BY name`;
  }
}
