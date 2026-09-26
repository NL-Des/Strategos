import type { ActorKind } from './enums.js';

/**
 * Actions tracées au journal (04 — Journal des modifications). Chaque étape ajoute
 * les siennes ; le frontend les traduit par `audit.actions.<action>`.
 */
export const AuditAction = {
  USER_CREATE: 'user.create',
  USER_RENAME: 'user.rename',
  USER_RESET_PASSWORD: 'user.reset_password',
  USER_DISABLE: 'user.disable',
  USER_ENABLE: 'user.enable',
  USER_DELETE: 'user.delete',
  USER_CHANGE_CREDENTIALS: 'user.change_credentials',
  PAGE_CREATE: 'page.create',
  PAGE_UPDATE: 'page.update',
  PAGE_PUBLISH: 'page.publish',
  PAGE_DELETE: 'page.delete',
  LAYOUT_UPDATE: 'layout.update',
  LAYOUT_PUBLISH: 'layout.publish',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',
  SETTINGS_UPDATE: 'settings.update',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const AUDIT_ACTIONS = Object.values(AuditAction);

export const AuditTargetType = {
  USER: 'user',
  PAGE: 'page',
  LAYOUT: 'layout',
  MEDIA: 'media',
  SETTINGS: 'settings',
} as const;
export type AuditTargetType = (typeof AuditTargetType)[keyof typeof AuditTargetType];
export const AUDIT_TARGET_TYPES = Object.values(AuditTargetType);

/** Entrée du journal (`GET /admin/audit`). */
export interface AuditEntry {
  id: string;
  actorKind: ActorKind;
  /** Compte à l'origine de l'action ; `null` pour `system` et `cli`. */
  actor: { id: string; username: string } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
