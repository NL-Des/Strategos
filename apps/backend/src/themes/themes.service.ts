import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type Theme,
  type ThemeConfig,
  withThemeDefaults,
} from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma, Theme as ThemeRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Db, isUniqueViolation } from '../prisma/prisma.types.js';
import type { CreateThemeDto, UpdateThemeDto } from './themes.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/**
 * Thèmes (06 — Thèmes) : un thème par défaut désigné dans les réglages, et un
 * thème facultatif par page. Chaque modification est tracée au journal.
 */
@Injectable()
export class ThemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Theme[]> {
    const [themes, designated] = await Promise.all([
      this.prisma.theme.findMany({ orderBy: { name: 'asc' } }),
      this.designated(this.prisma),
    ]);
    return themes.map((t) => toTheme(t, designated));
  }

  async get(id: string): Promise<Theme> {
    const theme = await this.prisma.theme.findUnique({ where: { id } });
    if (!theme) throw notFound();
    return toTheme(theme, await this.designated(this.prisma));
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.theme.count({ where: { id } })) > 0;
  }

  /** Thème de la page s'il existe encore, sinon le thème par défaut. */
  async resolve(themeId: string | null): Promise<{ id: string; config: ThemeConfig }> {
    const theme =
      (themeId ? await this.prisma.theme.findUnique({ where: { id: themeId } }) : null) ??
      (
        await this.prisma.setting.findUniqueOrThrow({
          where: { id: 1 },
          include: { defaultTheme: true },
        })
      ).defaultTheme;
    if (!theme) throw new Error('Aucun thème par défaut : données initiales absentes.');
    return { id: theme.id, config: withThemeDefaults(theme.config) };
  }

  /** Thème du mode sombre désigné dans les réglages, s'il y en a un. */
  async resolveDark(): Promise<{ id: string; config: ThemeConfig } | null> {
    const settings = await this.prisma.setting.findUnique({
      where: { id: 1 },
      include: { darkTheme: true },
    });
    const theme = settings?.darkTheme;
    return theme ? { id: theme.id, config: withThemeDefaults(theme.config) } : null;
  }

  async create(dto: CreateThemeDto, actor: AuditActor): Promise<Theme> {
    await this.checkMedia(dto.config);
    return this.withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const theme = await tx.theme.create({
          data: { name: dto.name, config: json(dto.config) },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.THEME_CREATE,
          targetType: AuditTargetType.THEME,
          targetId: theme.id,
          after: themeState(theme),
        });
        return toTheme(theme, await this.designated(tx));
      }),
    );
  }

  async update(id: string, dto: UpdateThemeDto, actor: AuditActor): Promise<Theme> {
    await this.checkMedia(dto.config);
    return this.withNameCheck(() =>
      this.prisma.$transaction(async (tx) => {
        const before = await tx.theme.findUnique({ where: { id } });
        if (!before) throw notFound();
        const { count } = await tx.theme.updateMany({
          where: { id, version: dto.version },
          data: { name: dto.name, config: json(dto.config), version: { increment: 1 } },
        });
        if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
        const after = await tx.theme.findUniqueOrThrow({ where: { id } });
        await this.audit.record(tx, actor, {
          action: AuditAction.THEME_UPDATE,
          targetType: AuditTargetType.THEME,
          targetId: id,
          before: themeState(before),
          after: themeState(after),
        });
        return toTheme(after, await this.designated(tx));
      }),
    );
  }

  /**
   * Suppression physique (14 — `themes`), refusée pour le thème par défaut. Les
   * pages publiées qui l'utilisaient reviennent au thème par défaut (`on delete
   * set null`) ; les brouillons qui le citent aussi, pour rester enregistrables.
   * S'il était le thème du mode sombre, les réglages n'en désignent plus (`set null`).
   */
  async remove(id: string, actor: AuditActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const theme = await tx.theme.findUnique({ where: { id } });
      if (!theme) throw notFound();
      if ((await this.designated(tx)).defaultId === id) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.DEFAULT_THEME);
      }
      await tx.$executeRaw`
        UPDATE "pages" SET "draft_config" = jsonb_set("draft_config", '{themeId}', 'null'::jsonb)
        WHERE "draft_config"->>'themeId' = ${id}`;
      await tx.theme.delete({ where: { id } });
      await this.audit.record(tx, actor, {
        action: AuditAction.THEME_DELETE,
        targetType: AuditTargetType.THEME,
        targetId: id,
        before: themeState(theme),
      });
    });
  }

  /** Thèmes désignés dans les réglages : par défaut, et pour le mode sombre. */
  private async designated(db: Db): Promise<Designated> {
    const settings = await db.setting.findUnique({ where: { id: 1 } });
    return {
      defaultId: settings?.defaultThemeId ?? null,
      darkId: settings?.darkThemeId ?? null,
    };
  }

  /** L'image de fond vient de la médiathèque. */
  private async checkMedia(config: ThemeConfig): Promise<void> {
    const mediaId = config.background.imageMediaId;
    if (mediaId && !(await this.prisma.media.count({ where: { id: mediaId, deletedAt: null } }))) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { 'config.background.imageMediaId': ['notFound'] },
      });
    }
  }

  private async withNameCheck<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.THEME_NAME_TAKEN);
      }
      throw error;
    }
  }
}

/** Config en JSON pur : pas d'instances de classes de validation dans la base. */
const json = (config: ThemeConfig) => JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue;

interface Designated {
  defaultId: string | null;
  darkId: string | null;
}

function toTheme(theme: ThemeRow, { defaultId, darkId }: Designated): Theme {
  return {
    id: theme.id,
    name: theme.name,
    config: withThemeDefaults(theme.config),
    version: theme.version,
    isDefault: theme.id === defaultId,
    isDark: theme.id === darkId,
  };
}

function themeState(theme: ThemeRow) {
  return { name: theme.name, config: theme.config };
}
