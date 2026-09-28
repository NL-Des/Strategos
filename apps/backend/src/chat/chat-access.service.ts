import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { Chat, ChatMessage, User } from '../generated/prisma/client.js';
import { PageAccessService, readerOf } from '../pages/page-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);

/**
 * Accès au chat (07 — Chat). Contrairement aux espaces de discussion, le chat
 * n'est **pas** une ressource du modèle de droits : quiconque peut lire la page
 * qui contient le bloc peut lire et écrire le chat (même logique que les
 * formulaires). On passe donc par `PageAccessService`, jamais par les droits de
 * groupe. Une ressource illisible est introuvable : `404`, jamais `403`.
 */
@Injectable()
export class ChatAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageAccess: PageAccessService,
  ) {}

  /** Le chat d'un bloc, si l'utilisateur peut lire sa page ; sinon `404`. */
  async requireChatByBlock(user: User, blockId: string): Promise<Chat> {
    const chat = await this.prisma.chat.findFirst({ where: { blockId, deletedAt: null } });
    if (!chat) throw notFound();
    await this.requirePageReadable(user, chat.pageId);
    return chat;
  }

  /** Le message non supprimé et son chat, si l'utilisateur peut lire la page ; sinon `404`. */
  async requireChatMessage(
    user: User,
    messageId: string,
  ): Promise<{ message: ChatMessage; chat: Chat }> {
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: { chat: true },
    });
    if (!message || message.chat.deletedAt) throw notFound();
    await this.requirePageReadable(user, message.chat.pageId);
    const { chat, ...rest } = message;
    return { message: rest as ChatMessage, chat };
  }

  /** L'auteur d'un message, ou l'admin ; sinon `403 NOT_AUTHOR`. */
  requireAuthor(user: User, authorId: string): void {
    if (!user.isAdmin && user.id !== authorId) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.NOT_AUTHOR);
    }
  }

  private async requirePageReadable(user: User, pageId: string): Promise<void> {
    const readable = await this.pageAccess.readablePageIds(readerOf(user), [pageId]);
    if (!readable.has(pageId)) throw notFound();
  }
}
