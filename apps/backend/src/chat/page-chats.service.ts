import { Injectable } from '@nestjs/common';
import type { Block, ChatBlockConfig, PageConfig, PublishPreview } from '@strategos/shared';
import type { Chat, Prisma } from '../generated/prisma/client.js';
import type { Db } from '../prisma/prisma.types.js';

type ChatBlock = { id: string; config: ChatBlockConfig };

/** Blocs `chat` d'un brouillon de page. */
function chatBlocks(config: PageConfig): ChatBlock[] {
  const rows = [...(config.zones.main ?? []), ...(config.zones.sidebar ?? [])];
  const blocks = rows
    .flatMap((r) => r.columns)
    .map((c) => c.block)
    .filter((b): b is Block => b != null);
  return blocks
    .filter((b) => b.type === 'chat')
    .map((b) => ({ id: b.id, config: b.config as ChatBlockConfig }));
}

interface ChatChange {
  blockId: string;
  name: string;
  change: 'created' | 'updated' | 'deleted';
}

/**
 * Chats d'une page à la publication (06 — Brouillon et publication, 07). Un chat
 * (`chats`) est créé à la **publication** de la page qui contient son bloc,
 * jamais avant ; son nom suit le brouillon. Le bloc retiré à une publication →
 * chat en suppression douce. Calqué sur `PageSpacesService`.
 */
@Injectable()
export class PageChatsService {
  /** Ce que publier `draft` changerait aux chats de la page. */
  async changes(db: Db, pageId: string, draft: PageConfig): Promise<ChatChange[]> {
    const existing = await db.chat.findMany({ where: { pageId } });
    const byBlock = new Map<string, Chat>(existing.map((c) => [c.blockId, c]));
    const blocks = chatBlocks(draft);
    const inDraft = new Set(blocks.map((b) => b.id));
    const changes: ChatChange[] = [];
    for (const block of blocks) {
      const current = byBlock.get(block.id);
      if (!current || current.deletedAt) {
        changes.push({ blockId: block.id, name: block.config.name, change: 'created' });
      } else if (current.name !== block.config.name) {
        changes.push({ blockId: block.id, name: block.config.name, change: 'updated' });
      }
    }
    for (const chat of existing) {
      if (!chat.deletedAt && !inDraft.has(chat.blockId)) {
        changes.push({ blockId: chat.blockId, name: chat.name, change: 'deleted' });
      }
    }
    return changes;
  }

  /** `chats` de l'aperçu de publication : chats créés ou retirés. */
  async preview(db: Db, pageId: string, draft: PageConfig): Promise<PublishPreview['chats']> {
    const changes = await this.changes(db, pageId, draft);
    return changes
      .filter((c) => c.change !== 'updated')
      .map((c) => ({ name: c.name, change: c.change as 'created' | 'deleted' }));
  }

  /**
   * Applique les changements dans la transaction de publication de la page : crée
   * le chat manquant (ou réactive un chat supprimé au même bloc), met à jour son
   * nom, et met en suppression douce le chat dont le bloc a disparu.
   */
  async publish(tx: Prisma.TransactionClient, pageId: string, draft: PageConfig): Promise<void> {
    const now = new Date();
    const blocks = chatBlocks(draft);
    for (const block of blocks) {
      await tx.chat.upsert({
        where: { blockId: block.id },
        create: { pageId, blockId: block.id, name: block.config.name },
        update: { name: block.config.name, deletedAt: null },
      });
    }
    const inDraft = new Set(blocks.map((b) => b.id));
    const removed = await tx.chat.findMany({
      where: { pageId, deletedAt: null, blockId: { notIn: [...inDraft] } },
      select: { id: true },
    });
    if (removed.length > 0) {
      await tx.chat.updateMany({
        where: { id: { in: removed.map((c) => c.id) } },
        data: { deletedAt: now },
      });
    }
  }
}
