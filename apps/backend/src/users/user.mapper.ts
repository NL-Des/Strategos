import type { Me, UserDetail } from '@strategos/shared';
import type { User } from '../generated/prisma/client.js';

// Mappers explicites : le hash du mot de passe ne sort jamais de l'API.

export function toMe(user: User): Me {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    mustChangeCredentials: user.mustChangeCredentials,
    landingPageId: null,
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
