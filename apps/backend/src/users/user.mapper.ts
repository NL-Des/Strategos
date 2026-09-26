import type { Me, UserDetail, UserRights, UserSummary } from '@strategos/shared';
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

export function toUserSummary(user: User): UserSummary {
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

/** Fiche d'un compte : ses groupes sont ceux de ses droits effectifs (même calcul). */
export function toUserDetail(user: User, rights: UserRights): UserDetail {
  return {
    ...toUserSummary(user),
    personalPageId: user.personalPageId,
    groups: rights.groups,
    rights,
  };
}

/** État d'un compte tel qu'écrit au journal (avant/après) ; jamais de hash. */
export function toUserAuditState(user: User) {
  return {
    username: user.username,
    status: user.disabledAt ? 'disabled' : 'active',
    mustChangeCredentials: user.mustChangeCredentials,
    personalPageId: user.personalPageId,
    deleted: user.deletedAt !== null,
  };
}
