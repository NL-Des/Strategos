import type { Me, UserDetail } from '@strategos/shared';
import type { User } from '../generated/prisma/client.js';

// Mappers explicites : le hash du mot de passe ne sort jamais de l'API.

export function toMe(user: User, landingPageId: string | null): Me {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    mustChangeCredentials: user.mustChangeCredentials,
    landingPageId,
    personalPageId: user.personalPageId,
  };
}

export function toUserDetail(user: User): UserDetail {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    status: user.disabledAt ? 'disabled' : 'active',
    mustChangeCredentials: user.mustChangeCredentials,
    createdAt: user.createdAt.toISOString(),
    version: user.version,
  };
}

/** État d'un compte tel qu'écrit au journal (avant/après) ; jamais de hash. */
export function toUserAuditState(user: User) {
  return {
    username: user.username,
    status: user.disabledAt ? 'disabled' : 'active',
    mustChangeCredentials: user.mustChangeCredentials,
    deleted: user.deletedAt !== null,
  };
}
