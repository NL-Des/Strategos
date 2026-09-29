import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  MEDIA_MIME_TYPES,
  type MediaItem,
  type Paginated,
  WarningCode,
} from '@strategos/shared';
import { fileTypeFromBuffer } from 'file-type';
import type { AuditActor } from '../audit/audit-actor.js';
import { AuditService } from '../audit/audit.service.js';
import { AppException } from '../common/app-exception.js';
import { findJsonUsages, findThemeUsages, type JsonUsages } from '../common/json-usages.js';
import { config } from '../config.js';
import type { Media } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from '../prisma/prisma.types.js';
import type { ListMediaQueryDto } from './media.dto.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

function toMediaItem(media: Media): MediaItem {
  return {
    id: media.id,
    filename: media.filename,
    mime: media.mime,
    sizeBytes: Number(media.sizeBytes),
    alt: media.alt,
    url: `/api/v1/media/${media.id}`,
    createdAt: media.createdAt.toISOString(),
  };
}

/**
 * Nom affiché et référencé par les catalogues (« epee.png ») : sans chemin ni
 * caractère de contrôle. Multer décode les noms en latin1 : on les relit en UTF-8.
 */
export function cleanFilename(original: string): string {
  const utf8 = Buffer.from(original, 'latin1').toString('utf8');
  return basename(utf8.replaceAll('\\', '/'))
    .replace(/\p{Cc}/gu, '')
    .trim()
    .slice(0, 200);
}

/** Médiathèque (06) : images sur le volume `uploads`, métadonnées en base. */
/** Usages d'une image : ceux des pages et du header/footer, plus les fonds de thème. */
export interface MediaUsages extends JsonUsages {
  themes: { id: string; name: string }[];
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListMediaQueryDto): Promise<Paginated<MediaItem>> {
    const where = {
      deletedAt: null,
      ...(query.q ? { filename: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.media.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.media.count({ where }),
    ]);
    return { items: rows.map(toMediaItem), total, page: query.page, pageSize: query.pageSize };
  }

  /** Enregistre une image ; son type est vérifié sur le contenu, pas sur le nom. */
  async upload(
    file: { buffer: Buffer; originalname: string },
    alt: string | undefined,
    actor: AuditActor & { kind: 'user' },
  ): Promise<MediaItem> {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !(MEDIA_MIME_TYPES as readonly string[]).includes(detected.mime)) {
      throw new AppException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    const filename = cleanFilename(file.originalname);
    if (!filename) {
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: { file: ['filename'] },
      });
    }

    const storagePath = join('media', `${randomUUID()}.${detected.ext}`);
    const absolute = join(config.uploadsDir, storagePath);
    await mkdir(join(config.uploadsDir, 'media'), { recursive: true });
    await writeFile(absolute, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const media = await tx.media.create({
          data: {
            filename,
            storagePath,
            mime: detected.mime,
            sizeBytes: file.buffer.length,
            alt: alt?.trim() || null,
            uploadedBy: actor.userId,
          },
        });
        await this.audit.record(tx, actor, {
          action: AuditAction.MEDIA_UPLOAD,
          targetType: AuditTargetType.MEDIA,
          targetId: media.id,
          after: { filename, mime: media.mime, sizeBytes: file.buffer.length },
        });
        return toMediaItem(media);
      });
    } catch (error) {
      await unlink(absolute).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.MEDIA_NAME_TAKEN);
      }
      throw error;
    }
  }

  /** Fichier d'une image non supprimée, pour tout utilisateur connecté. */
  async file(id: string): Promise<{ path: string; mime: string }> {
    const media = await this.prisma.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw notFound();
    return { path: join(config.uploadsDir, media.storagePath), mime: media.mime };
  }

  /** Pages (brouillon ou version publiée), header/footer et thèmes qui citent l'image. */
  async usages(id: string): Promise<MediaUsages> {
    const [json, themes] = await Promise.all([
      findJsonUsages(this.prisma, id),
      findThemeUsages(this.prisma, id),
    ]);
    return { ...json, themes };
  }

  /**
   * Suppression douce. Encore utilisée → `409 CONFIRMATION_REQUIRED` avec les
   * pages concernées ; `confirm: true` passe outre (les modules l'ignorent alors).
   */
  async remove(id: string, confirm: boolean, actor: AuditActor): Promise<void> {
    const media = await this.prisma.media.findFirst({ where: { id, deletedAt: null } });
    if (!media) throw notFound();
    const usages = await this.usages(id);
    const used = usages.pages.length + usages.layouts.length + usages.themes.length > 0;
    if (!confirm && used) {
      throw new AppException(HttpStatus.CONFLICT, ErrorCode.CONFIRMATION_REQUIRED, {
        warnings: [
          {
            code: WarningCode.MEDIA_IN_USE,
            message: 'Cette image est encore utilisée.',
            pages: usages.pages,
            layouts: usages.layouts,
            themes: usages.themes,
          },
        ],
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.media.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, actor, {
        action: AuditAction.MEDIA_DELETE,
        targetType: AuditTargetType.MEDIA,
        targetId: id,
        before: { filename: media.filename, deleted: false },
        after: { filename: media.filename, deleted: true, usedBy: usages.pages.map((p) => p.name) },
      });
    });
  }
}
