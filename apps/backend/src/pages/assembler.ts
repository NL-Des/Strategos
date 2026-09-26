import type {
  AssembledBlock,
  AssembledRow,
  Block,
  LinkTarget,
  ResolvedLink,
  Row,
} from '@strategos/shared';

/**
 * Contexte de lecture : ce que l'assemblage doit savoir du lecteur. L'aperçu admin
 * et l'affichage réel passent par la même fonction (06 — Aperçu par groupe).
 */
export interface ReaderContext {
  personalPageId: string | null;
  canReadPage: (pageId: string) => boolean;
  mediaExists: (mediaId: string) => boolean;
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
    case 'rich_content':
      return { id: block.id, type: 'rich_content', config: { html: block.config.html } };
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

/** Pages et médias cités par une structure, pour les charger en une requête. */
export function collectReferences(rows: Row[]): { pageIds: Set<string>; mediaIds: Set<string> } {
  const pageIds = new Set<string>();
  const mediaIds = new Set<string>();
  const addLink = (link?: LinkTarget) => {
    if (link?.kind === 'page' && link.pageId) pageIds.add(link.pageId);
  };
  for (const block of rows.flatMap((r) => r.columns).map((c) => c.block)) {
    if (block?.type === 'image') {
      mediaIds.add(block.config.mediaId);
      addLink(block.config.link);
    }
    if (block?.type === 'buttons') block.config.buttons.forEach((b) => addLink(b.target));
  }
  return { pageIds, mediaIds };
}
