import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, AuditTargetType, ErrorCode, type InstanceSettings } from '@strategos/shared';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import type { Setting } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateSettingsDto } from './settings.dto.js';

function toSettings(row: Setting): InstanceSettings {
  return {
    landingPageId: row.landingPageId,
    defaultThemeId: row.defaultThemeId!,
    darkThemeId: row.darkThemeId,
    backupRetentionDays: row.backupRetentionDays,
    externalImages: row.externalImages,
    externalImageDomains: row.externalImageDomains,
    version: row.version,
  };
}

/** Réglages de l'instance (04) : une seule ligne, verrou optimiste, modifications tracées. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<InstanceSettings> {
    return toSettings(await this.prisma.setting.findUniqueOrThrow({ where: { id: 1 } }));
  }

  /** Page d'arrivée, si elle existe encore (sa suppression douce ne touche pas les réglages). */
  async landingPageId(): Promise<string | null> {
    const settings = await this.prisma.setting.findUniqueOrThrow({
      where: { id: 1 },
      include: { landingPage: { select: { id: true, deletedAt: true } } },
    });
    const page = settings.landingPage;
    return page && !page.deletedAt ? page.id : null;
  }

  async update(dto: UpdateSettingsDto, actor: AuditActor): Promise<InstanceSettings> {
    const fields: Record<string, string[]> = {};
    const landingPageId = dto.landingPageId ?? null;
    if (
      landingPageId &&
      !(await this.prisma.page.count({ where: { id: landingPageId, deletedAt: null } }))
    ) {
      fields.landingPageId = ['notFound'];
    }
    if (!(await this.prisma.theme.count({ where: { id: dto.defaultThemeId } }))) {
      fields.defaultThemeId = ['notFound'];
    }
    const darkThemeId = dto.darkThemeId ?? null;
    if (darkThemeId && !(await this.prisma.theme.count({ where: { id: darkThemeId } }))) {
      fields.darkThemeId = ['notFound'];
    }
    if (Object.keys(fields).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, { fields });
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.setting.findUniqueOrThrow({ where: { id: 1 } });
      const { count } = await tx.setting.updateMany({
        where: { id: 1, version: dto.version },
        data: {
          landingPageId,
          defaultThemeId: dto.defaultThemeId,
          darkThemeId,
          backupRetentionDays: dto.backupRetentionDays,
          ...(dto.externalImages !== undefined ? { externalImages: dto.externalImages } : {}),
          ...(dto.externalImageDomains !== undefined
            ? {
                externalImageDomains: [
                  ...new Set(dto.externalImageDomains.map((d) => d.trim().toLowerCase())),
                ].sort(),
              }
            : {}),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT);
      const after = await tx.setting.findUniqueOrThrow({ where: { id: 1 } });
      const state = (s: Setting) => {
        const { version: _version, ...rest } = toSettings(s);
        return rest;
      };
      await this.audit.record(tx, actor, {
        action: AuditAction.SETTINGS_UPDATE,
        targetType: AuditTargetType.SETTINGS,
        before: state(before),
        after: state(after),
      });
      return toSettings(after);
    });
  }
}
