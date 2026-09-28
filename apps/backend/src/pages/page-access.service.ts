import { Injectable } from '@nestjs/common';
import { ResourceType } from '@strategos/shared';
import type { User } from '../generated/prisma/client.js';
import { resourceKey } from '../groups/resolve-rights.js';
import { RightsService, type RightsSubject } from '../groups/rights.service.js';
import type { SpaceInfo } from './assembler.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Lecteur d'une page : l'admin (tous les droits), ou un sujet résolu par groupes. */
export type PageReader = { admin: true } | RightsSubject;

export const readerOf = (user: User): PageReader =>
  user.isAdmin ? { admin: true } : { userId: user.id };

/**
 * Qui peut lire quelle page : une page publiée et non supprimée, sur laquelle
 * le lecteur a le droit de lecture (03), calculé par `RightsService`.
 */
@Injectable()
export class PageAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rights: RightsService,
  ) {}

  /** Parmi `pageIds`, celles que le lecteur peut lire. */
  async readablePageIds(reader: PageReader, pageIds: Iterable<string>): Promise<Set<string>> {
    const ids = [...new Set(pageIds)];
    if (ids.length === 0) return new Set();
    const pages = await this.prisma.page.findMany({
      where: { id: { in: ids }, deletedAt: null, publishedAt: { not: null } },
      select: { id: true },
    });
    const published = pages.map((p) => p.id);
    if ('admin' in reader) return new Set(published);
    return this.rights.readable(reader, ResourceType.page, published);
  }

  /**
   * Espaces de discussion lisibles parmi des blocs `discussion_space`, avec les
   * droits du lecteur (ouvrir un sujet, poster). Un espace pas encore créé
   * (page jamais publiée) ou illisible est absent de la map : le module disparaît.
   */
  async readableSpaces(
    reader: PageReader,
    blockIds: Iterable<string>,
  ): Promise<Map<string, SpaceInfo>> {
    const ids = [...new Set(blockIds)];
    const result = new Map<string, SpaceInfo>();
    if (ids.length === 0) return result;
    const spaces = await this.prisma.discussionSpace.findMany({
      where: { blockId: { in: ids }, deletedAt: null },
      select: { id: true, blockId: true },
    });
    if (spaces.length === 0) return result;
    if ('admin' in reader) {
      for (const s of spaces) {
        result.set(s.blockId, { spaceId: s.id, canCreateTopic: true, canPost: true });
      }
      return result;
    }
    const rights = await this.rights.rightsOf(reader, {
      type: ResourceType.space,
      ids: spaces.map((s) => s.id),
    });
    for (const s of spaces) {
      const effective = rights.get(resourceKey(ResourceType.space, s.id));
      if (!effective || effective.read.length === 0) continue;
      result.set(s.blockId, {
        spaceId: s.id,
        canCreateTopic: effective.createTopic.length > 0,
        canPost: effective.post.length > 0,
      });
    }
    return result;
  }
}
