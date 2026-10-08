import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Block,
  type CatalogBlockConfig,
  type CatalogCard,
  type CellFormat,
  type ConfiguredDataSourceRef,
  columnNumber,
  ErrorCode,
  type FormDefinition,
  isDataConfigured,
  type LayoutConfig,
  PAGE_SIZE_MAX,
  type PageConfig,
  type Paginated,
  type Row,
  type TableBlockConfig,
  type TableRow,
} from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import { isConfigured } from '../forms/form-definition.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EMPTY_CELL,
  formatRowCell,
  formatText,
  imageResolver,
  type StoredCell,
} from '../sources/cell-format.js';
import { rangeColumns, rangeRect } from '../sources/data-range.js';
import {
  positionKey,
  SourceDataService,
  SourceUnavailableError,
  sourceException,
} from '../sources/source-data.service.js';
import { sheetsOf } from '../sources/sources.service.js';
import { PageAccessService, readerOf } from './page-access.service.js';
import { richCells } from './rich-cells.js';

type DataBlock = Extract<Block, { type: 'table' | 'catalog' }>;

export interface RowsQuery {
  page: number;
  pageSize?: number;
  /** `<indice de colonne affichée>:asc|desc`. */
  sort?: string;
  q?: string;
}

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/** Formulaire de ligne relié à un module : sa clé est renvoyée avec chaque ligne. */
interface RowForm {
  formId: string;
  keyCol: number;
}

/** Formats triés comme des nombres (dates : numéro de série). */
const NUMERIC_FORMATS: readonly CellFormat[] = ['number', 'currency', 'date'];

function findBlock(rows: Row[] | null | undefined, id: string): Block | null {
  for (const row of rows ?? []) {
    for (const column of row.columns) if (column.block?.id === id) return column.block;
  }
  return null;
}

function blockOfPage(config: PageConfig | null, id: string): Block | null {
  return config ? (findBlock(config.zones.main, id) ?? findBlock(config.zones.sidebar, id)) : null;
}

/** Colonnes lues par un module de données, dans l'ordre d'affichage. */
function displayed(block: DataBlock): { col: number; format: CellFormat }[] {
  const c = block.config;
  if (block.type === 'table') {
    return (c as TableBlockConfig).columns
      .filter((col) => col.visible)
      .map((col) => ({ col: columnNumber(col.col), format: col.format }));
  }
  const cat = c as CatalogBlockConfig;
  return [
    ...(cat.imageCol ? [{ col: columnNumber(cat.imageCol), format: 'image' as const }] : []),
    ...(cat.titleCol ? [{ col: columnNumber(cat.titleCol), format: 'text' as const }] : []),
    ...(cat.subtitleCol ? [{ col: columnNumber(cat.subtitleCol), format: 'text' as const }] : []),
    ...cat.details.map((d) => ({ col: columnNumber(d.col), format: d.format })),
  ];
}

function compare(a: StoredCell, b: StoredCell, format: CellFormat): number {
  const aEmpty = a.type === 'empty';
  const bEmpty = b.type === 'empty';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (NUMERIC_FORMATS.includes(format) && a.number !== null && b.number !== null) {
    return a.number - b.number;
  }
  return formatText(a, format).localeCompare(formatText(b, format), 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Tableaux et Catalogues (06) : lignes lues dans la source, puis recherche, tri
 * et pagination **côté backend**. Les réponses ne contiennent que des valeurs
 * formatées, jamais de source, de feuille ni de cellule.
 */
@Injectable()
export class DataBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: SourceDataService,
    private readonly access: PageAccessService,
  ) {}

  /** Lignes d'un module publié, pour un lecteur de sa page (ou du header/footer). */
  async publishedRows(
    blockId: string,
    user: User,
    query: RowsQuery,
  ): Promise<Paginated<TableRow | CatalogCard>> {
    const found = await this.findPublished(blockId);
    if (!found) throw notFound();
    if (found.pageId) {
      const readable = await this.access.readablePageIds(readerOf(user), [found.pageId]);
      if (!readable.has(found.pageId)) throw notFound();
    }
    const forms = found.pageId ? await this.rowForms(found.pageId, blockId, false) : [];
    return this.rows(found.block, query, forms);
  }

  /** Lignes d'un module de brouillon (aperçu admin), ou de la version publiée. */
  async previewRows(blockId: string, query: RowsQuery): Promise<Paginated<TableRow | CatalogCard>> {
    const draft = await this.findDraft(blockId);
    const found = draft ?? (await this.findPublished(blockId));
    if (!found) throw notFound();
    const forms = found.pageId ? await this.rowForms(found.pageId, blockId, !!draft) : [];
    return this.rows(found.block, query, forms);
  }

  /**
   * Formulaires de ligne configurés qui relient ce module et dont le bloc est
   * sur la même version de la page (publiée, ou brouillon en aperçu).
   */
  private async rowForms(pageId: string, blockId: string, draft: boolean): Promise<RowForm[]> {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    const config = (draft ? page?.draftConfig : page?.publishedConfig) as PageConfig | null;
    const forms = await this.prisma.form.findMany({
      where: { pageId, deletedAt: null, mode: 'ligne' },
      include: { published: true },
    });
    return forms.flatMap((form) => {
      const def = (draft ? form.draftDefinition : form.published?.definition) as
        FormDefinition | undefined;
      const onPage = blockOfPage(config, form.blockId)?.type === 'form';
      return def && onPage && def.linkedBlockId === blockId && isConfigured('ligne', def)
        ? [{ formId: form.id, keyCol: columnNumber(def.keyCol!) }]
        : [];
    });
  }

  /**
   * Sources et feuilles citées par un brouillon : elles doivent exister
   * (`VALIDATION_FAILED`, chemin du champ fautif dans `details.fields`).
   */
  async checkReferences(zones: Record<string, Row[] | null>, prefix: string): Promise<void> {
    const uses: { path: string; sourceId: string; sheet?: string }[] = [];
    for (const [zone, rows] of Object.entries(zones)) {
      (rows ?? []).forEach((row, i) =>
        row.columns.forEach((column, j) => {
          const block = column.block;
          const path = `${prefix}${zone ? `.${zone}` : ''}[${i}].columns[${j}].block.config`;
          // Un module non configuré (source vide) est accepté : il reste masqué.
          if ((block?.type === 'table' || block?.type === 'catalog') && block.config.sourceId) {
            uses.push({
              path,
              sourceId: block.config.sourceId,
              sheet: block.config.sheet ?? undefined,
            });
          }
          if (block?.type === 'rich_content') {
            for (const cell of richCells(block.config.html)) {
              uses.push({ path: `${path}.html`, sourceId: cell.sourceId });
            }
          }
        }),
      );
    }
    if (uses.length === 0) return;
    const sources = await this.prisma.source.findMany({
      where: { id: { in: [...new Set(uses.map((u) => u.sourceId))] }, deletedAt: null },
    });
    const fields: Record<string, string[]> = {};
    for (const use of uses) {
      const source = sources.find((s) => s.id === use.sourceId);
      if (!source) {
        fields[use.sheet === undefined ? use.path : `${use.path}.sourceId`] = ['sourceNotFound'];
      } else if (use.sheet !== undefined && !sheetsOf(source).includes(use.sheet)) {
        fields[`${use.path}.sheet`] = ['sheetNotFound'];
      }
    }
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }
  }

  private async rows(
    block: Block,
    query: RowsQuery,
    rowForms: RowForm[],
  ): Promise<Paginated<TableRow | CatalogCard>> {
    if (block.type !== 'table' && block.type !== 'catalog') throw notFound();
    // Module non configuré (modèle instancié) : masqué, comme absent.
    const config = block.config;
    if (!isDataConfigured(config)) throw notFound();
    const pageSize = Math.min(query.pageSize ?? config.pageSize, PAGE_SIZE_MAX);
    const columns = displayed(block);

    let lines: StoredCell[][];
    try {
      // Colonnes clés des formulaires de ligne lues en plus, après les colonnes affichées.
      lines = await this.readLines(
        config,
        columns,
        rowForms.map((f) => ({ col: f.keyCol })),
      );
    } catch (error) {
      if (error instanceof SourceUnavailableError) {
        throw sourceException(error);
      }
      throw error;
    }

    // Recherche : dans les valeurs affichées (hors images), sans tenir compte de la casse.
    const q = query.q?.trim().toLocaleLowerCase('fr');
    if (q && config.searchable) {
      lines = lines.filter((line) =>
        line
          .slice(0, columns.length)
          .some(
            (cell, i) =>
              columns[i]!.format !== 'image' &&
              formatText(cell, columns[i]!.format).toLocaleLowerCase('fr').includes(q),
          ),
      );
    }
    const sort = /^(\d+):(asc|desc)$/.exec(query.sort ?? '');
    if (sort && block.type === 'table' && (config as TableBlockConfig).sortable) {
      const i = Number(sort[1]);
      if (i < columns.length) {
        const direction = sort[2] === 'desc' ? -1 : 1;
        lines = lines
          .map((line, index) => ({ line, index }))
          .sort(
            (a, b) =>
              direction * compare(a.line[i]!, b.line[i]!, columns[i]!.format) || a.index - b.index,
          )
          .map((x) => x.line);
      }
    }

    const slice = lines.slice((query.page - 1) * pageSize, query.page * pageSize);
    const settings = await this.prisma.setting.findUniqueOrThrow({
      where: { id: 1 },
      select: { externalImages: true, externalImageDomains: true },
    });
    const imageUrl = imageResolver(
      await this.mediaByName(
        slice.map((line) => line.slice(0, columns.length)),
        columns,
      ),
      { mode: settings.externalImages, domains: settings.externalImageDomains },
    );
    const cells = (line: StoredCell[]) =>
      line
        .slice(0, columns.length)
        .map((cell, i) => formatRowCell(cell, columns[i]!.format, imageUrl));
    const keys = (line: StoredCell[]) =>
      rowForms.length > 0
        ? {
            rowKeys: Object.fromEntries(
              rowForms.map((f, i) => [
                f.formId,
                formatText(line[columns.length + i]!, 'text').trim(),
              ]),
            ),
          }
        : {};
    const items =
      block.type === 'table'
        ? slice.map((line) => ({ cells: cells(line), ...keys(line) }))
        : slice.map((line) => ({
            ...this.card(config as CatalogBlockConfig, cells(line)),
            ...keys(line),
          }));
    return { items, total: lines.length, page: query.page, pageSize };
  }

  private card(config: CatalogBlockConfig, cells: ReturnType<typeof formatRowCell>[]): CatalogCard {
    let i = 0;
    const image = config.imageCol ? (cells[i++]!.image ?? null) : null;
    const title = config.titleCol ? cells[i++]! : null;
    const subtitle = config.subtitleCol ? cells[i++]! : null;
    return { image, title, subtitle, details: cells.slice(i) };
  }

  /** Lignes de données de la plage (en-têtes exclus), lignes entièrement vides ignorées. */
  private async readLines(
    config: (TableBlockConfig | CatalogBlockConfig) & ConfiguredDataSourceRef,
    columns: { col: number }[],
    extra: { col: number }[] = [],
  ): Promise<StoredCell[][]> {
    const cols = rangeColumns(config);
    const last =
      config.range.mode === 'extensible' && cols
        ? await this.data.lastFilledRow(
            config.sourceId,
            config.sheet,
            cols,
            config.range.startRow ?? 1,
          )
        : null;
    const rect = rangeRect(config, last);
    if (!rect) return [];
    const top = rect.top + (config.headerRow ? 1 : 0);
    if (rect.bottom < top) return [];
    const wanted = [...columns, ...extra].map((c) => c.col);
    const read = await this.data.readRect(config.sourceId, config.sheet, {
      ...rect,
      top,
      left: Math.min(rect.left, ...wanted),
      right: Math.max(rect.right, ...wanted),
    });
    const lines: StoredCell[][] = [];
    for (let row = top; row <= rect.bottom; row++) {
      const line = columns.map(({ col }) => read.get(positionKey(row, col)) ?? EMPTY_CELL);
      if (line.some((cell) => cell.type !== 'empty')) {
        lines.push([
          ...line,
          ...extra.map(({ col }) => read.get(positionKey(row, col)) ?? EMPTY_CELL),
        ]);
      }
    }
    return lines;
  }

  /** Images de la médiathèque citées par nom de fichier dans les lignes affichées. */
  private async mediaByName(
    lines: StoredCell[][],
    columns: { format: CellFormat }[],
  ): Promise<Map<string, string>> {
    const names = new Set<string>();
    for (const line of lines) {
      line.forEach((cell, i) => {
        const text = formatText(cell, 'text').trim();
        if (columns[i]!.format === 'image' && text && !/^https?:\/\//i.test(text)) names.add(text);
      });
    }
    if (names.size === 0) return new Map();
    const media = await this.prisma.media.findMany({
      where: { deletedAt: null, filename: { in: [...names], mode: 'insensitive' } },
      select: { id: true, filename: true },
    });
    return new Map(media.map((m) => [m.filename.toLowerCase(), `/api/v1/media/${m.id}`]));
  }

  /** Module publié : sur une page publiée non supprimée, ou dans le header/footer publié. */
  private async findPublished(
    blockId: string,
  ): Promise<{ block: Block; pageId: string | null } | null> {
    const pages = await this.prisma.$queryRaw<{ id: string; config: PageConfig }[]>`
      SELECT id, published_config AS config FROM pages
      WHERE deleted_at IS NULL AND published_at IS NOT NULL
        AND jsonb_path_exists(published_config, '$.zones.*[*].columns[*].block ? (@.id == $id)',
                              jsonb_build_object('id', ${blockId}::text))
      LIMIT 1`;
    const page = pages[0];
    if (page) {
      const block = blockOfPage(page.config, blockId);
      return block && { block, pageId: page.id };
    }
    const parts = await this.prisma.$queryRaw<{ config: LayoutConfig }[]>`
      SELECT published_config AS config FROM layout_parts
      WHERE jsonb_path_exists(published_config, '$.rows[*].columns[*].block ? (@.id == $id)',
                              jsonb_build_object('id', ${blockId}::text))
      LIMIT 1`;
    const block = parts[0] ? findBlock(parts[0].config.rows, blockId) : null;
    return block && { block, pageId: null };
  }

  /** Module d'un brouillon de page ou du header/footer. */
  private async findDraft(
    blockId: string,
  ): Promise<{ block: Block; pageId: string | null } | null> {
    const pages = await this.prisma.$queryRaw<{ id: string; config: PageConfig }[]>`
      SELECT id, draft_config AS config FROM pages
      WHERE deleted_at IS NULL
        AND jsonb_path_exists(draft_config, '$.zones.*[*].columns[*].block ? (@.id == $id)',
                              jsonb_build_object('id', ${blockId}::text))
      LIMIT 1`;
    if (pages[0]) {
      const block = blockOfPage(pages[0].config, blockId);
      return block && { block, pageId: pages[0].id };
    }
    const parts = await this.prisma.$queryRaw<{ config: LayoutConfig }[]>`
      SELECT draft_config AS config FROM layout_parts
      WHERE jsonb_path_exists(draft_config, '$.rows[*].columns[*].block ? (@.id == $id)',
                              jsonb_build_object('id', ${blockId}::text))
      LIMIT 1`;
    const block = parts[0] ? findBlock(parts[0].config.rows, blockId) : null;
    return block && { block, pageId: null };
  }
}
