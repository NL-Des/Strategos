import {
  type AssembledBlock,
  type AssembledRow,
  type Block,
  type BlockError,
  columnNumber,
  type DataSourceRef,
  type FormLinks,
  type FormMode,
  type LinkTarget,
  parseRangeRef,
  type ResolvedLink,
  type Row,
  type RowFormLink,
} from '@strategos/shared';
import { formatText, type StoredCell } from '../sources/cell-format.js';
import { headerRow, rangeColumns } from '../sources/data-range.js';
import type { CellNeed } from '../sources/source-data.service.js';
import { replaceRichCells, richCells } from './rich-cells.js';

/**
 * Contexte de lecture : ce que l'assemblage doit savoir du lecteur et des
 * données. L'aperçu admin et l'affichage réel passent par la même fonction
 * (06 — Aperçu par groupe) ; les valeurs sont lues avant, en une fois.
 */
export interface ReaderContext {
  personalPageId: string | null;
  canReadPage: (pageId: string) => boolean;
  mediaExists: (mediaId: string) => boolean;
  /** Cellule lue pour l'assemblage (Contenu libre, en-têtes) ; vide si absente. */
  cell: (need: CellNeed) => StoredCell;
  sourceAvailable: (sourceId: string) => boolean;
  /** Adresse des lignes d'un Tableau ou d'un Catalogue (page publiée ou aperçu). */
  rowsUrl: (blockId: string) => string;
  /** Formulaire d'un bloc `form` (version publiée, ou brouillon en aperçu) ; `null` s'il n'existe plus. */
  form: (formId: string) => FormInfo | null;
  /** Formulaires de ligne reliés à un Tableau ou un Catalogue. */
  rowForms: (blockId: string) => RowFormLink[];
  formLinks: (formId: string) => FormLinks;
  /** Espace de discussion d'un bloc : `null` si illisible ou pas encore publié. */
  discussionSpace: (blockId: string) => SpaceInfo | null;
}

/** Espace de discussion résolu pour un lecteur : son id et ses droits. */
export interface SpaceInfo {
  spaceId: string;
  canCreateTopic: boolean;
  canPost: boolean;
}

export interface FormInfo {
  blockId: string;
  mode: FormMode;
  configured: boolean;
}

const unavailable = (ref: { sourceId: string }, ctx: ReaderContext): { error?: BlockError } =>
  ctx.sourceAvailable(ref.sourceId) ? {} : { error: 'SOURCE_UNAVAILABLE' };

/** Libellé d'une colonne : celui de l'admin, sinon l'en-tête du document, sinon sa lettre. */
function columnLabel(ref: DataSourceRef, col: string, label: string, ctx: ReaderContext): string {
  if (label.trim()) return label.trim();
  const row = headerRow(ref);
  if (row !== null && ctx.sourceAvailable(ref.sourceId)) {
    const text = formatText(
      ctx.cell({ sourceId: ref.sourceId, sheet: ref.sheet, row, col: columnNumber(col) }),
      'text',
    );
    if (text) return text;
  }
  return col;
}

export function resolveLink(link: LinkTarget | undefined, ctx: ReaderContext): ResolvedLink | null {
  if (!link) return null;
  if (link.kind === 'url') return { kind: 'url', url: link.url! };
  const pageId = link.kind === 'personal_page' ? ctx.personalPageId : link.pageId!;
  return pageId && ctx.canReadPage(pageId) ? { kind: 'page', pageId } : null;
}

/** Un module non configuré, ou vidé par le filtrage des liens, devient `null`. */
function assembleBlock(block: Block, ctx: ReaderContext): AssembledBlock | null {
  switch (block.type) {
    case 'image': {
      const { mediaId, alt, size, align, link } = block.config;
      if (!ctx.mediaExists(mediaId)) return null;
      return {
        id: block.id,
        type: 'image',
        config: { src: `/api/v1/media/${mediaId}`, alt, size, align, link: resolveLink(link, ctx) },
      };
    }
    case 'buttons': {
      const buttons = block.config.buttons.flatMap((b) => {
        const link = resolveLink(b.target, ctx);
        return link ? [{ id: b.id, label: b.label, link }] : [];
      });
      if (buttons.length === 0) return null;
      const { orientation, align } = block.config;
      return { id: block.id, type: 'buttons', config: { buttons, orientation, align } };
    }
    case 'rich_content': {
      const cells = richCells(block.config.html);
      const values = cells.map((c) => {
        if (!ctx.sourceAvailable(c.sourceId)) return { value: '', needsRecalc: false };
        const cell = ctx.cell(c);
        return { value: formatText(cell, c.format), needsRecalc: cell.needsRecalc };
      });
      const error = cells.some((c) => !ctx.sourceAvailable(c.sourceId));
      return {
        id: block.id,
        type: 'rich_content',
        config: { html: replaceRichCells(block.config.html), values },
        ...(error ? { error: 'SOURCE_UNAVAILABLE' as const } : {}),
      };
    }
    // Tableau et Catalogue : ni source, ni feuille, ni plage vers le lecteur.
    case 'table': {
      const c = block.config;
      return {
        id: block.id,
        type: 'table',
        config: {
          columns: c.columns
            .filter((col) => col.visible)
            .map((col) => ({ label: columnLabel(c, col.col, col.label, ctx), format: col.format })),
          pageSize: c.pageSize,
          sortable: c.sortable,
          searchable: c.searchable,
        },
        rowsUrl: ctx.rowsUrl(block.id),
        rowForms: ctx.rowForms(block.id),
        ...unavailable(c, ctx),
      };
    }
    case 'catalog': {
      const c = block.config;
      return {
        id: block.id,
        type: 'catalog',
        config: {
          layout: c.layout,
          hasImage: !!c.imageCol,
          detailLabels: c.details.map((d) => columnLabel(c, d.col, d.label, ctx)),
          perRow: c.perRow,
          pageSize: c.pageSize,
          searchable: c.searchable,
        },
        rowsUrl: ctx.rowsUrl(block.id),
        rowForms: ctx.rowForms(block.id),
        ...unavailable(c, ctx),
      };
    }
    // Formulaire : absent tant qu'il n'est pas configuré. Un formulaire de ligne
    // n'est pas rendu seul : il s'ouvre depuis son Tableau ou son Catalogue.
    case 'form': {
      const { formId } = block.config;
      const form = ctx.form(formId);
      if (!form || form.blockId !== block.id || !form.configured || form.mode === 'ligne') {
        return null;
      }
      return { id: block.id, type: 'form', config: { formId, ...ctx.formLinks(formId) } };
    }
    // Espace de discussion : invisible si le lecteur ne peut pas le lire, ou s'il
    // n'a pas encore été créé (publication de la page).
    case 'discussion_space': {
      const info = ctx.discussionSpace(block.id);
      if (!info) return null;
      const { name, sortMode } = block.config;
      return {
        id: block.id,
        type: 'discussion_space',
        config: { name, sortMode, canCreateTopic: info.canCreateTopic, canPost: info.canPost },
        topicsUrl: `/api/v1/spaces/${info.spaceId}/topics`,
      };
    }
    // Chat : visible dès que le lecteur peut lire la page (pas de filtrage par
    // droit). Le salon est identifié par l'id du bloc ; l'envoi passe par le
    // WebSocket, l'historique par `messagesUrl`.
    case 'chat': {
      const { name, height } = block.config;
      return {
        id: block.id,
        type: 'chat',
        config: { name, height },
        messagesUrl: `/api/v1/chats/${block.id}/messages`,
      };
    }
  }
}

export function assembleRows(rows: Row[], ctx: ReaderContext): AssembledRow[] {
  return rows.map((row) => ({
    id: row.id,
    columns: row.columns.map((column) => ({
      width: column.width,
      block: column.block ? assembleBlock(column.block, ctx) : null,
    })),
  }));
}

/** Ce qu'une structure cite, pour tout charger avant l'assemblage. */
export interface References {
  pageIds: Set<string>;
  mediaIds: Set<string>;
  sourceIds: Set<string>;
  /** Cellules lues à l'assemblage : valeurs du Contenu libre, en-têtes sans libellé. */
  cells: CellNeed[];
  /** Blocs `form` : formulaire → bloc. */
  forms: Map<string, string>;
  /** Id des blocs `discussion_space` de la structure. */
  spaceBlockIds: Set<string>;
}

/** Première cellule de la plage d'un module. */
function rangeProbe(ref: DataSourceRef): { row: number; col: number } | null {
  const cols = rangeColumns(ref);
  const top =
    ref.range.mode === 'fixed'
      ? parseRangeRef(ref.range.ref ?? '')?.top
      : (ref.range.startRow ?? 1);
  return cols && top ? { row: top, col: cols.left } : null;
}

export function collectReferences(rows: Row[]): References {
  const pageIds = new Set<string>();
  const mediaIds = new Set<string>();
  const sourceIds = new Set<string>();
  const cells: CellNeed[] = [];
  const forms = new Map<string, string>();
  const spaceBlockIds = new Set<string>();
  const headers = (ref: DataSourceRef, columns: { col: string; label: string }[]) => {
    sourceIds.add(ref.sourceId);
    // Sonde : une cellule de la plage est lue, pour savoir si la source répond
    // (une source connectée injoignable marque alors le module indisponible).
    const probe = rangeProbe(ref);
    if (probe) cells.push({ sourceId: ref.sourceId, sheet: ref.sheet, ...probe });
    const row = headerRow(ref);
    if (row === null) return;
    for (const { col, label } of columns) {
      if (!label.trim()) {
        cells.push({ sourceId: ref.sourceId, sheet: ref.sheet, row, col: columnNumber(col) });
      }
    }
  };
  const addLink = (link?: LinkTarget) => {
    if (link?.kind === 'page' && link.pageId) pageIds.add(link.pageId);
  };
  for (const block of rows.flatMap((r) => r.columns).map((c) => c.block)) {
    if (block?.type === 'image') {
      mediaIds.add(block.config.mediaId);
      addLink(block.config.link);
    }
    if (block?.type === 'buttons') block.config.buttons.forEach((b) => addLink(b.target));
    if (block?.type === 'rich_content') {
      for (const cell of richCells(block.config.html)) {
        sourceIds.add(cell.sourceId);
        cells.push(cell);
      }
    }
    if (block?.type === 'table') {
      headers(
        block.config,
        block.config.columns.filter((c) => c.visible),
      );
    }
    if (block?.type === 'catalog') headers(block.config, block.config.details);
    if (block?.type === 'form') forms.set(block.config.formId, block.id);
    if (block?.type === 'discussion_space') spaceBlockIds.add(block.id);
  }
  return { pageIds, mediaIds, sourceIds, cells, forms, spaceBlockIds };
}
