import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type AttachmentRef,
  ATTACHMENT_MIME_TYPES,
  ErrorCode,
  ResourceType,
} from '@strategos/shared';
import { fileTypeFromBuffer } from 'file-type';
import { AppException } from '../common/app-exception.js';
import { config } from '../config.js';
import type { Attachment, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RightsService } from '../groups/rights.service.js';

/** Une image jamais jointe à un message est supprimée après ce délai. */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

export function toAttachmentRef(a: Attachment): AttachmentRef {
  return { id: a.id, url: `/api/v1/attachments/${a.id}`, mime: a.mime, sizeBytes: a.sizeBytes };
}

/**
 * Pièces jointes images des messages (07). Une image est d'abord uploadée (non
 * rattachée), puis liée à un message à sa création. Elle n'est lisible que par
 * qui peut lire l'espace du message (une image encore libre : par son auteur).
 *
 * L'envoi est borné : il faut pouvoir lire au moins un espace, le total des
 * images encore libres d'un compte est plafonné, et celles qui le restent plus
 * de 24 h sont supprimées.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rights: RightsService,
  ) {}

  /** Enregistre une image ; son type est vérifié sur le contenu, pas sur le nom. */
  async upload(file: { buffer: Buffer }, uploader: User): Promise<AttachmentRef> {
    if (!(await this.canReadSomeSpace(uploader))) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
    }
    const pending = await this.prisma.attachment.aggregate({
      where: { uploaderId: uploader.id, topicMessageId: null, chatMessageId: null },
      _sum: { sizeBytes: true },
    });
    if ((pending._sum.sizeBytes ?? 0) + file.buffer.length > config.attachmentPendingQuotaBytes) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.ATTACHMENT_QUOTA_EXCEEDED);
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !(ATTACHMENT_MIME_TYPES as readonly string[]).includes(detected.mime)) {
      throw new AppException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_FILE_TYPE);
    }
    const storagePath = join('attachments', `${randomUUID()}.${detected.ext}`);
    await mkdir(join(config.uploadsDir, 'attachments'), { recursive: true });
    await writeFile(join(config.uploadsDir, storagePath), file.buffer);
    const attachment = await this.prisma.attachment.create({
      data: {
        uploaderId: uploader.id,
        storagePath,
        mime: detected.mime,
        sizeBytes: file.buffer.length,
      },
    });
    return toAttachmentRef(attachment);
  }

  /** Fichier d'une pièce jointe, si le demandeur peut la voir. */
  async file(id: string, user: User): Promise<{ path: string; mime: string }> {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { topicMessage: { include: { topic: { include: { space: true } } } } },
    });
    if (!attachment) throw notFound();
    const message = attachment.topicMessage;
    if (!message) {
      // Image encore libre (pas de message) : seul son auteur y accède.
      if (attachment.uploaderId !== user.id) throw notFound();
    } else {
      if (message.deletedAt || message.topic.deletedAt || message.topic.space.deletedAt) {
        throw notFound();
      }
      if (!(await this.canReadSpace(user, message.topic.spaceId))) throw notFound();
    }
    return { path: join(config.uploadsDir, attachment.storagePath), mime: attachment.mime };
  }

  /** Supprime, fichier compris, les images restées libres plus de 24 h. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgePending(now = new Date()): Promise<number> {
    const stale = await this.prisma.attachment.findMany({
      where: {
        topicMessageId: null,
        chatMessageId: null,
        createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) },
      },
      select: { id: true, storagePath: true },
    });
    for (const attachment of stale) {
      // La ligne d'abord : une image rattachée entre-temps n'est plus libre et reste.
      const { count } = await this.prisma.attachment.deleteMany({
        where: { id: attachment.id, topicMessageId: null, chatMessageId: null },
      });
      if (count) {
        await unlink(join(config.uploadsDir, attachment.storagePath)).catch(() => undefined);
      }
    }
    return stale.length;
  }

  private async canReadSomeSpace(user: User): Promise<boolean> {
    if (user.isAdmin) return true;
    const spaces = await this.prisma.discussionSpace.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    const readable = await this.rights.readable(
      { userId: user.id },
      ResourceType.space,
      spaces.map((space) => space.id),
    );
    return readable.size > 0;
  }

  private async canReadSpace(user: User, spaceId: string): Promise<boolean> {
    if (user.isAdmin) return true;
    return this.rights.canRead({ userId: user.id }, ResourceType.space, spaceId);
  }
}
