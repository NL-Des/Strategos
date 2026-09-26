import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AdminPage,
  type AdminPageSummary,
  type AssembledPage,
  AuditAction,
  AuditTargetType,
  EMPTY_PAGE_CONFIG,
  ErrorCode,
  type PageConfig,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Page, Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Db } from '../prisma/prisma.types.js';
import { ThemesService } from '../themes/themes.service.js';
import { assembleRows, type ReaderContext } from './assembler.js';
import { countBlocks, validatePageConfig } from './config-validator.js';
import type { CreatePageDto, SavePageDraftDto } from './pages.dto.js';
import { ReaderContextService } from './reader-context.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

function draftOf(page: Page): PageConfig {
  return { ...EMPTY_PAGE_CONFIG, ...(page.draftConfig as object) } as PageConfig;
}

function publishedOf(page: Page): PageConfig | null {
  return page.publishedConfig ? (page.publishedConfig as unknown as PageConfig) : null;
}

/** État d'une page au journal : résumé lisible, pas la structure complète. */
function auditState(page: Page, config: PageConfig | null) {
  return {
    name: page.name,
    published: page.publishedAt !== null,
    ...(config
      ? {
          themeId: config.themeId,
          showHeader: config.showHeader,
          showFooter: config.showFooter,
          blocks: countBlocks([config.zones.main, config.zones.sidebar]),
        }
      : {}),
  };
}

function toAdminPage(page: Page): AdminPage {
  return {
    id: page.id,
    name: page.name,
    draft: draftOf(page),
    published: publishedOf(page),
    publishedAt: page.publishedAt?.toISOString() ?? null,
    updatedAt: page.updatedAt.toISOString(),
    version: page.version,
  };
}

/** Pages : brouillon, aperçu et publication (06 — Brouillon et publication). */
@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly themes: ThemesService,
    private readonly readers: ReaderContextService,
  ) {}

  async list(): Promise<AdminPageSummary[]> {
    const pages = await this.prisma.page.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return pages.map((page) => ({
      id: page.id,
      name: page.name,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      hasDraftChanges: JSON.stringify(page.draftConfig) !== JSON.stringify(page.publishedConfig),
      updatedAt: page.updatedAt.toISOString(),
    }));
  }

  async get(id: string): Promise<AdminPage> {
    return toAdminPage(await this.getIn(this.prisma, id));
  }

  async create(dto: CreatePageDto, actor: AuditActor): Promise<AdminPage> {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.page.create({
        data: {
          name: dto.name,
          draftConfig: EMPTY_PAGE_CONFIG as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.PAGE_CREATE,
        targetType: AuditTargetType.PAGE,
        targetId: page.id,
        after: auditState(page, draftOf(page)),
      });
      return toAdminPage(page);
    });
  }

  /** Enregistre le brouillon ; les utilisateurs continuent de voir la version publiée. */
  async saveDraft(id: string, dto: SavePageDraftDto, actor: AuditActor): Promise<AdminPage> {
    const config = validatePageConfig(dto.config);
    if (config.themeId && !(await this.themes.exists(config.themeId))) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { 'config.themeId': ['notFound'] },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      const { count } = await tx.page.updateMany({
        where: { id, deletedAt: null, version: dto.version },
        data: {
          name: dto.name,
          draftConfig: config as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
      const after = await this.getIn(tx, id);
      await this.audit.record(tx, actor, {
        action: AuditAction.PAGE_UPDATE,
        targetType: AuditTargetType.PAGE,
        targetId: id,
        before: auditState(before, draftOf(before)),
        after: auditState(after, config),
      });
      return toAdminPage(after);
    });
  }

  /**
   * Publie le brouillon en une transaction : version en ligne, thème et affichage
   * du header et du footer. Les formulaires, espaces et chats s'y ajouteront.
   */
  async publish(id: string, admin: User, actor: AuditActor): Promise<AdminPage> {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      const config = validatePageConfig(before.draftConfig);
      const themeId =
        config.themeId && (await tx.theme.count({ where: { id: config.themeId } }))
          ? config.themeId
          : null;
      const published: PageConfig = { ...config, themeId };
      const after = await tx.page.update({
        where: { id },
        data: {
          publishedConfig: published as unknown as Prisma.InputJsonValue,
          publishedAt: new Date(),
          publishedBy: admin.id,
          themeId,
          showHeader: config.showHeader,
          showFooter: config.showFooter,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.PAGE_PUBLISH,
        targetType: AuditTargetType.PAGE,
        targetId: id,
        before: auditState(before, publishedOf(before)),
        after: auditState(after, published),
      });
      return toAdminPage(after);
    });
  }

  /** Suppression douce ; la page devient illisible, ses liens disparaissent. */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.getIn(tx, id);
      const after = await tx.page.update({
        where: { id },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(tx, actor, {
        action: AuditAction.PAGE_DELETE,
        targetType: AuditTargetType.PAGE,
        targetId: id,
        before: auditState(before, null),
        after: { ...auditState(after, null), deleted: true },
      });
    });
  }

  /** Brouillon assemblé, vu par l'administrateur ou avec les droits d'un groupe. */
  async preview(id: string, admin: User, asGroup?: string): Promise<AssembledPage> {
    const page = await this.getIn(this.prisma, id);
    const config = draftOf(page);
    const ctx = await this.readers.forPreview(admin, asGroup, this.rowsOf(config));
    return this.assemble(page, config, ctx);
  }

  /**
   * Page publiée, assemblée pour un lecteur ; jamais publiée → `404`. Le droit de
   * lecture est vérifié en amont par `PermissionsGuard`.
   */
  async read(id: string, user: User): Promise<AssembledPage> {
    const page = await this.getIn(this.prisma, id);
    const config = publishedOf(page);
    if (!config) throw notFound();
    return this.assemble(page, config, await this.readers.forUser(user, this.rowsOf(config)));
  }

  private rowsOf(config: PageConfig) {
    return [...(config.zones.main ?? []), ...(config.zones.sidebar ?? [])];
  }

  private async assemble(
    page: Page,
    config: PageConfig,
    ctx: ReaderContext,
  ): Promise<AssembledPage> {
    return {
      id: page.id,
      name: page.name,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      theme: await this.themes.resolve(config.themeId),
      showHeader: config.showHeader,
      showFooter: config.showFooter,
      zones: {
        main: config.zones.main ? assembleRows(config.zones.main, ctx) : null,
        sidebar: config.zones.sidebar ? assembleRows(config.zones.sidebar, ctx) : null,
      },
      unavailableSources: [],
    };
  }

  private async getIn(db: Db, id: string): Promise<Page> {
    const page = await db.page.findFirst({ where: { id, deletedAt: null } });
    if (!page) throw notFound();
    return page;
  }
}
