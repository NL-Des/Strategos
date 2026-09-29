import type { ActorKind } from './enums.js';

/**
 * Actions tracées au journal (04 — Journal des modifications). Chaque étape ajoute
 * les siennes ; le frontend les traduit par `audit.actions.<action>`.
 */
export const AuditAction = {
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_GROUPS: 'user.groups',
  USER_RESET_PASSWORD: 'user.reset_password',
  USER_DISABLE: 'user.disable',
  USER_ENABLE: 'user.enable',
  USER_DELETE: 'user.delete',
  USER_CHANGE_CREDENTIALS: 'user.change_credentials',
  USER_CHANGE_PASSWORD: 'user.change_password',
  GROUP_CREATE: 'group.create',
  GROUP_UPDATE: 'group.update',
  GROUP_DELETE: 'group.delete',
  GROUP_MEMBERS: 'group.members',
  GROUP_PERMISSIONS: 'group.permissions',
  PAGE_CREATE: 'page.create',
  PAGE_UPDATE: 'page.update',
  PAGE_PUBLISH: 'page.publish',
  PAGE_DELETE: 'page.delete',
  LAYOUT_UPDATE: 'layout.update',
  LAYOUT_PUBLISH: 'layout.publish',
  MEDIA_UPLOAD: 'media.upload',
  MEDIA_DELETE: 'media.delete',
  SETTINGS_UPDATE: 'settings.update',
  THEME_CREATE: 'theme.create',
  THEME_UPDATE: 'theme.update',
  THEME_DELETE: 'theme.delete',
  NOTES_READ: 'notes.read',
  TEMPLATE_CREATE: 'template.create',
  TEMPLATE_DELETE: 'template.delete',
  TEMPLATE_INSTANTIATE: 'template.instantiate',
  SOURCE_UPLOAD: 'source.upload',
  SOURCE_DOWNLOAD: 'source.download',
  SOURCE_DELETE: 'source.delete',
  SOURCE_REIMPORT: 'source.reimport',
  SOURCE_ADD: 'source.add',
  ONEDRIVE_CONNECT: 'onedrive.connect',
  FORM_CREATE: 'form.create',
  FORM_UPDATE: 'form.update',
  FORM_PUBLISH: 'form.publish',
  FORM_DELETE: 'form.delete',
  FORM_SETTINGS: 'form.settings',
  SUBMISSION_VALIDATE: 'submission.validate',
  SUBMISSION_MODIFY: 'submission.modify',
  SUBMISSION_REJECT: 'submission.reject',
  SUBMISSION_INVALIDATE: 'submission.invalidate',
  MESSAGE_HIDE: 'message.hide',
  MESSAGE_UNHIDE: 'message.unhide',
  /** L'admin modifie ou supprime le message d'un autre (l'auteur, lui, n'est pas tracé). */
  MESSAGE_ADMIN_EDIT: 'message.admin_edit',
  MESSAGE_ADMIN_DELETE: 'message.admin_delete',
  TOPIC_DELETE: 'topic.delete',
  TRASH_RESTORE: 'trash.restore',
  BACKUP_RESTORE: 'backup.restore',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const AUDIT_ACTIONS = Object.values(AuditAction);

export const AuditTargetType = {
  USER: 'user',
  GROUP: 'group',
  PAGE: 'page',
  LAYOUT: 'layout',
  MEDIA: 'media',
  SETTINGS: 'settings',
  THEME: 'theme',
  TEMPLATE: 'template',
  SOURCE: 'source',
  ONEDRIVE: 'onedrive',
  FORM: 'form',
  SUBMISSION: 'submission',
  MESSAGE: 'message',
  TOPIC: 'topic',
  BACKUP: 'backup',
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
