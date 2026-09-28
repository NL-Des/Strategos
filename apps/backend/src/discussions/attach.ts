import { HttpStatus } from '@nestjs/common';
import { ErrorCode, MESSAGE_MAX_ATTACHMENTS } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Rattache des pièces jointes à un message, dans sa transaction (07). Chaque
 * image doit appartenir à l'auteur et être encore libre (non rattachée) ; au
 * plus 4 par message (`422 TOO_MANY_ATTACHMENTS`).
 */
export async function attachToMessage(
  tx: Prisma.TransactionClient,
  messageId: string,
  uploaderId: string,
  attachmentIds: string[] | undefined,
): Promise<void> {
  const ids = [...new Set(attachmentIds ?? [])];
  if (ids.length === 0) return;
  if (ids.length > MESSAGE_MAX_ATTACHMENTS) {
    throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.TOO_MANY_ATTACHMENTS);
  }
  const owned = await tx.attachment.findMany({
    where: { id: { in: ids }, uploaderId, topicMessageId: null, chatMessageId: null },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
      fields: { attachmentIds: ['notFound'] },
    });
  }
  await tx.attachment.updateMany({
    where: { id: { in: ids } },
    data: { topicMessageId: messageId },
  });
}
