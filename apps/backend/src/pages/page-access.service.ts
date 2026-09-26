import { Injectable } from '@nestjs/common';
import { ResourceType } from '@strategos/shared';
import type { User } from '../generated/prisma/client.js';
import { RightsService, type RightsSubject } from '../groups/rights.service.js';
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
}
