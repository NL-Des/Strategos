import { Injectable } from '@nestjs/common';
import type { Row } from '@strategos/shared';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { collectReferences, type ReaderContext } from './assembler.js';
import { PageAccessService } from './page-access.service.js';

/** Prépare en une fois ce que l'assemblage doit savoir des pages et médias cités. */
@Injectable()
export class ReaderContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PageAccessService,
  ) {}

  /** Lecteur réel : ses droits et sa page personnelle. */
  async forUser(user: User, rows: Row[]): Promise<ReaderContext> {
    const { pageIds, mediaIds } = collectReferences(rows);
    if (user.personalPageId) pageIds.add(user.personalPageId);
    const [readable, media] = await Promise.all([
      this.access.readablePageIds(pageIds),
      this.existingMedia(mediaIds),
    ]);
    return {
      personalPageId: user.personalPageId,
      canReadPage: (id) => readable.has(id),
      mediaExists: (id) => media.has(id),
    };
  }

  /**
   * Aperçu administrateur : tout est visible, pages non publiées comprises ;
   * « Ma page personnelle » est celle de l'admin.
   */
  async forAdmin(admin: User, rows: Row[]): Promise<ReaderContext> {
    const { pageIds, mediaIds } = collectReferences(rows);
    if (admin.personalPageId) pageIds.add(admin.personalPageId);
    const [pages, media] = await Promise.all([
      this.prisma.page.findMany({
        where: { id: { in: [...pageIds] }, deletedAt: null },
        select: { id: true },
      }),
      this.existingMedia(mediaIds),
    ]);
    const existing = new Set(pages.map((p) => p.id));
    return {
      personalPageId: admin.personalPageId,
      canReadPage: (id) => existing.has(id),
      mediaExists: (id) => media.has(id),
    };
  }

  private async existingMedia(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true },
    });
    return new Set(rows.map((m) => m.id));
  }
}
