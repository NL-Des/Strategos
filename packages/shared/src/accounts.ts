/** Comptes et authentification (02, 13 — routes Authentification et Comptes). */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 32;

import type { GroupRef, UserRights } from './rights.js';

/** Utilisateur courant, renvoyé par `GET /auth/me` et `POST /auth/login`. */
export interface Me {
  id: string;
  username: string;
  isAdmin: boolean;
  mustChangeCredentials: boolean;
  landingPageId: string | null;
  personalPageId: string | null;
}

export type UserStatus = 'active' | 'disabled';

/** Ligne de la liste des comptes (`GET /admin/users`). */
export interface UserSummary {
  id: string;
  username: string;
  isAdmin: boolean;
  status: UserStatus;
  mustChangeCredentials: boolean;
  createdAt: string;
  version: number;
}

/** Fiche d'un compte (`GET /admin/users/:id`) : groupes, droits effectifs, page personnelle. */
export interface UserDetail extends UserSummary {
  personalPageId: string | null;
  groups: GroupRef[];
  rights: UserRights;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE_MAX = 200;
