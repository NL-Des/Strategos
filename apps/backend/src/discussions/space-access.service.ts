import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, ResourceType } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';
import type { DiscussionSpace, Topic, TopicMessage, User } from '../generated/prisma/client.js';
import { resourceKey } from '../groups/resolve-rights.js';
import { RightsService } from '../groups/rights.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const notFound = () => new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
/** Ressource lisible mais action interdite (13 — codes de retour) : `403`. */
const forbidden = () => new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);

/** Un droit exigé sur un espace : lecture, ouverture de sujet ou publication. */
export type SpaceRight = 'read' | 'createTopic' | 'post';

/**
 * Droits sur les espaces de discussion (03, 07). Les routes indirectes
 * (`/topics/:id`, `/messages/:id`) résolvent leur espace ici, car
 * `PermissionsGuard` ne sait résoudre qu'un id de route direct. Tout calcul de
 * droits passe par `RightsService` (règle unique). Une ressource illisible est
 * introuvable : `404`, jamais `403`, pour ne pas révéler son existence.
 */
@Injectable()
export class SpaceAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rights: RightsService,
  ) {}

  /** L'espace non supprimé, si l'utilisateur y a le droit `right` ; sinon `404`/`403`. */
  async requireSpace(user: User, spaceId: string, right: SpaceRight): Promise<DiscussionSpace> {
    const space = await this.prisma.discussionSpace.findFirst({
      where: { id: spaceId, deletedAt: null },
    });
    if (!space) throw notFound();
    await this.check(user, spaceId, right);
    return space;
  }

  /** Le sujet non supprimé et son espace, si l'utilisateur a le droit `right`. */
  async requireTopic(
    user: User,
    topicId: string,
    right: SpaceRight,
  ): Promise<{ topic: Topic; space: DiscussionSpace }> {
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
      include: { space: true },
    });
    if (!topic || topic.space.deletedAt) throw notFound();
    await this.check(user, topic.spaceId, right);
    const { space, ...rest } = topic;
    return { topic: rest as Topic, space };
  }

  /** Le message non supprimé, son sujet et son espace, si l'utilisateur a le droit `right`. */
  async requireMessage(
    user: User,
    messageId: string,
    right: SpaceRight,
  ): Promise<{ message: TopicMessage; topic: Topic; space: DiscussionSpace }> {
    const message = await this.prisma.topicMessage.findFirst({
      where: { id: messageId, deletedAt: null },
      include: { topic: { include: { space: true } } },
    });
    if (!message || message.topic.deletedAt || message.topic.space.deletedAt) throw notFound();
    await this.check(user, message.topic.spaceId, right);
    const { topic, ...message_ } = message;
    const { space, ...topic_ } = topic;
    return { message: message_ as TopicMessage, topic: topic_ as Topic, space };
  }

  /** L'auteur d'un contenu, ou l'admin ; sinon `403 NOT_AUTHOR`. */
  requireAuthor(user: User, authorId: string): void {
    if (!user.isAdmin && user.id !== authorId) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.NOT_AUTHOR);
    }
  }

  /** Droits effectifs de l'utilisateur sur l'espace (l'admin a tout). */
  async flags(
    user: User,
    spaceId: string,
  ): Promise<{ read: boolean; createTopic: boolean; post: boolean }> {
    if (user.isAdmin) return { read: true, createTopic: true, post: true };
    const rights = await this.rights.rightsOf(
      { userId: user.id },
      { type: ResourceType.space, ids: [spaceId] },
    );
    const effective = rights.get(resourceKey(ResourceType.space, spaceId));
    return {
      read: !!effective?.read.length,
      createTopic: !!effective?.createTopic.length,
      post: !!effective?.post.length,
    };
  }

  /**
   * Vérifie le droit `right` sur l'espace. Lecture absente → `404` (l'espace est
   * masqué). Droit de création absent alors que la lecture est acquise → `403`.
   */
  private async check(user: User, spaceId: string, right: SpaceRight): Promise<void> {
    const flags = await this.flags(user, spaceId);
    if (!flags.read) throw notFound();
    if (right === 'createTopic' && !flags.createTopic) throw forbidden();
    if (right === 'post' && !flags.post) throw forbidden();
  }
}
