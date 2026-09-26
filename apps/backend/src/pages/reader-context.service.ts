import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type Row } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { collectReferences, type ReaderContext } from './assembler.js';
import { PageAccessService, readerOf } from './page-access.service.js';

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
      this.access.readablePageIds(readerOf(user), pageIds),
      this.existingMedia(mediaIds),
    ]);
    return {
      personalPageId: user.personalPageId,
      canReadPage: (id) => readable.has(id),
      mediaExists: (id) => media.has(id),
    };
  }

  /**
   * Contexte d'un aperçu : vue administrateur complète, ou vue d'un membre du
   * seul groupe `asGroup` ; un groupe inconnu ou supprimé → `404`.
   */
  async forPreview(admin: User, asGroup: string | undefined, rows: Row[]): Promise<ReaderContext> {
    if (!asGroup) return this.forAdmin(admin, rows);
    if (!(await this.prisma.group.count({ where: { id: asGroup, deletedAt: null } }))) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
    }
    return this.forGroup(asGroup, rows);
  }

  /**
   * Aperçu avec les droits d'un groupe (06) : un membre fictif de ce seul groupe,
   * sans page personnelle. Même calcul que pour un lecteur réel.
   */
  async forGroup(groupId: string, rows: Row[]): Promise<ReaderContext> {
    const { pageIds, mediaIds } = collectReferences(rows);
    const [readable, media] = await Promise.all([
      this.access.readablePageIds({ groupId }, pageIds),
      this.existingMedia(mediaIds),
    ]);
    return {
      personalPageId: null,
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
