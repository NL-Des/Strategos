import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Qui peut lire quelle page. **Étape 3** : toute page publiée et non supprimée est
 * lisible par tout utilisateur connecté. L'étape 4 remplace cette règle par la
 * fonction de résolution des droits par groupes (03), sans toucher aux appelants.
 */
@Injectable()
export class PageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Parmi `pageIds`, celles que le lecteur peut lire. */
  async readablePageIds(pageIds: Iterable<string>): Promise<Set<string>> {
    const ids = [...new Set(pageIds)];
    if (ids.length === 0) return new Set();
    const pages = await this.prisma.page.findMany({
      where: { id: { in: ids }, deletedAt: null, publishedAt: { not: null } },
      select: { id: true },
    });
    return new Set(pages.map((p) => p.id));
  }

  async canReadPage(pageId: string): Promise<boolean> {
    return (await this.readablePageIds([pageId])).has(pageId);
  }
}
