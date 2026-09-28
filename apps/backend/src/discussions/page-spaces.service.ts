import { Injectable } from '@nestjs/common';
import type {
  Block,
  DiscussionSpaceBlockConfig,
  PageConfig,
  PublishPreview,
} from '@strategos/shared';
import type { DiscussionSpace, Prisma } from '../generated/prisma/client.js';
import type { Db } from '../prisma/prisma.types.js';

type SpaceBlock = { id: string; config: DiscussionSpaceBlockConfig };

/** Blocs `discussion_space` d'un brouillon de page. */
function spaceBlocks(config: PageConfig): SpaceBlock[] {
  const rows = [...(config.zones.main ?? []), ...(config.zones.sidebar ?? [])];
  const blocks = rows
    .flatMap((r) => r.columns)
    .map((c) => c.block)
    .filter((b): b is Block => b != null);
  return blocks
    .filter((b) => b.type === 'discussion_space')
    .map((b) => ({ id: b.id, config: b.config as DiscussionSpaceBlockConfig }));
}

interface SpaceChange {
  blockId: string;
  name: string;
  change: 'created' | 'updated' | 'deleted';
}

/**
 * Espaces de discussion d'une page à la publication (06 — Brouillon et publication,
 * 07). Un espace (`discussion_spaces`) est créé à la **publication** de la page qui
 * contient son bloc, jamais avant ; ses réglages (nom, tri) suivent le brouillon.
 * Le bloc retiré à une publication → espace en suppression douce. Calqué sur
 * `PageFormsService`.
 */
@Injectable()
export class PageSpacesService {
  /** Ce que publier `draft` changerait aux espaces de la page. */
  async changes(db: Db, pageId: string, draft: PageConfig): Promise<SpaceChange[]> {
    const existing = await db.discussionSpace.findMany({ where: { pageId } });
    const byBlock = new Map<string, DiscussionSpace>(existing.map((s) => [s.blockId, s]));
    const blocks = spaceBlocks(draft);
    const inDraft = new Set(blocks.map((b) => b.id));
    const changes: SpaceChange[] = [];
    for (const block of blocks) {
      const current = byBlock.get(block.id);
      if (!current || current.deletedAt) {
        changes.push({ blockId: block.id, name: block.config.name, change: 'created' });
      } else if (current.name !== block.config.name || current.sortMode !== block.config.sortMode) {
        changes.push({ blockId: block.id, name: block.config.name, change: 'updated' });
      }
    }
    for (const space of existing) {
      if (!space.deletedAt && !inDraft.has(space.blockId)) {
        changes.push({ blockId: space.blockId, name: space.name, change: 'deleted' });
      }
    }
    return changes;
  }

  /** `spaces` de l'aperçu de publication : espaces créés ou retirés. */
  async preview(db: Db, pageId: string, draft: PageConfig): Promise<PublishPreview['spaces']> {
    const changes = await this.changes(db, pageId, draft);
    return changes
      .filter((c) => c.change !== 'updated')
      .map((c) => ({ name: c.name, change: c.change as 'created' | 'deleted' }));
  }

  /**
   * Applique les changements dans la transaction de publication de la page : crée
   * l'espace manquant (ou réactive un espace supprimé au même bloc), met à jour
   * nom et tri, et met en suppression douce l'espace dont le bloc a disparu.
   */
  async publish(tx: Prisma.TransactionClient, pageId: string, draft: PageConfig): Promise<void> {
    const now = new Date();
    for (const block of spaceBlocks(draft)) {
      await tx.discussionSpace.upsert({
        where: { blockId: block.id },
        create: {
          pageId,
          blockId: block.id,
          name: block.config.name,
          sortMode: block.config.sortMode,
        },
        update: { name: block.config.name, sortMode: block.config.sortMode, deletedAt: null },
      });
    }
    const inDraft = new Set(spaceBlocks(draft).map((b) => b.id));
    const removed = await tx.discussionSpace.findMany({
      where: { pageId, deletedAt: null, blockId: { notIn: [...inDraft] } },
      select: { id: true },
    });
    if (removed.length > 0) {
      await tx.discussionSpace.updateMany({
        where: { id: { in: removed.map((s) => s.id) } },
        data: { deletedAt: now },
      });
    }
  }
}
