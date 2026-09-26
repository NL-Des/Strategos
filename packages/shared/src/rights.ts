import type { Paginated, UserStatus } from './accounts.js';

/**
 * Groupes et droits (03, 13 — routes Groupes et droits). Les droits effectifs
 * sont calculés par une seule fonction côté backend ; ces types en exposent le
 * résultat aux vues d'administration et au profil.
 */

/** Ressources du modèle de droits : pages et espaces de discussion. */
export const ResourceType = {
  page: 'page',
  space: 'space',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];
export const RESOURCE_TYPES = Object.values(ResourceType);

/** Droits accordables : une page n'accorde que la lecture. */
export const Right = {
  read: 'read',
  createTopic: 'createTopic',
  post: 'post',
} as const;
export type Right = (typeof Right)[keyof typeof Right];
export const RIGHTS = Object.values(Right);

export const GROUP_NAME_MAX_LENGTH = 64;
export const GROUP_DESCRIPTION_MAX_LENGTH = 500;

export interface GroupRef {
  id: string;
  name: string;
}

export interface UserRef {
  id: string;
  username: string;
}

export interface ResourceRef {
  type: ResourceType;
  id: string;
  name: string;
}

/** Pour chaque droit, les groupes qui l'accordent ; liste vide = droit absent. */
export type EffectiveRights = Record<Right, GroupRef[]>;

/** Droits effectifs d'un compte (`GET /admin/rights/users/:id`, profil). */
export interface UserRights {
  user: UserRef;
  groups: GroupRef[];
  /** Ressources sur lesquelles le compte a au moins un droit. */
  resources: { resource: ResourceRef; rights: EffectiveRights }[];
}

/** Qui a quels droits sur une ressource, et via quels groupes. */
export interface ResourceRights {
  resource: ResourceRef;
  /** Groupes qui déclarent une permission sur la ressource. */
  groups: { group: GroupRef; permission: Record<Right, boolean> }[];
  /** Comptes qui ont au moins un droit sur la ressource. */
  users: { user: UserRef; rights: EffectiveRights }[];
}

/** Matrice utilisateurs × ressources ; les cellules absentes n'ont aucun droit. */
export interface RightsMatrix {
  resources: ResourceRef[];
  users: Paginated<{ user: UserRef; cells: Record<string, Record<Right, boolean>> }>;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  version: number;
}

/** Permission déclarée par un groupe sur une ressource (`PUT /admin/groups/:id/permissions`). */
export interface GroupPermissionInput {
  resourceType: ResourceType;
  resourceId: string;
  canRead: boolean;
  canCreateTopic: boolean;
  canPost: boolean;
}

export interface GroupPermission extends GroupPermissionInput {
  resourceName: string;
}

/** Fiche d'un groupe : ses membres et les permissions qu'il déclare (vue « par groupe »). */
export interface GroupDetail extends GroupSummary {
  members: UserRef[];
  permissions: GroupPermission[];
}

/** Page administrative du profil (`GET /me/profile`). */
export interface Profile {
  id: string;
  username: string;
  createdAt: string;
  status: UserStatus;
  rights: UserRights;
}
