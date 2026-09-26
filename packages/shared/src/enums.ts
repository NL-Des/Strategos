/**
 * Énumérations du modèle de données (14 — Modèle de données), partagées par le
 * backend et le frontend. Elles doivent rester identiques aux `enum` de
 * `apps/backend/prisma/schema.prisma` (vérifié par un test du backend).
 */

/** `backup_status` */
export const BackupStatus = {
  running: 'running',
  ok: 'ok',
  failed: 'failed',
} as const;
export type BackupStatus = (typeof BackupStatus)[keyof typeof BackupStatus];

/** `layout_kind` */
export const LayoutKind = {
  header: 'header',
  footer: 'footer',
} as const;
export type LayoutKind = (typeof LayoutKind)[keyof typeof LayoutKind];

/** `topic_sort` */
export const TopicSort = {
  activity: 'activity',
  created: 'created',
} as const;
export type TopicSort = (typeof TopicSort)[keyof typeof TopicSort];

/** `revision_action` */
export const RevisionAction = {
  edit: 'edit',
  delete: 'delete',
  hide: 'hide',
  unhide: 'unhide',
} as const;
export type RevisionAction = (typeof RevisionAction)[keyof typeof RevisionAction];

/** `source_type` */
export const SourceType = {
  upload: 'upload',
  gsheet: 'gsheet',
  onedrive: 'onedrive',
} as const;
export type SourceType = (typeof SourceType)[keyof typeof SourceType];

/** `source_status` */
export const SourceStatus = {
  ok: 'ok',
  unavailable: 'unavailable',
  auth_expired: 'auth_expired',
} as const;
export type SourceStatus = (typeof SourceStatus)[keyof typeof SourceStatus];

/** `cell_type` */
export const CellType = {
  empty: 'empty',
  text: 'text',
  number: 'number',
  bool: 'bool',
  date: 'date',
  error: 'error',
} as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

/** `form_mode` */
export const FormMode = {
  modification: 'modification',
  ligne: 'ligne',
  ajout: 'ajout',
} as const;
export type FormMode = (typeof FormMode)[keyof typeof FormMode];

/** `submission_status` */
export const SubmissionStatus = {
  pending: 'pending',
  validated: 'validated',
  rejected: 'rejected',
  modified: 'modified',
  invalidated: 'invalidated',
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

/** `template_type` */
export const TemplateType = {
  form: 'form',
  page: 'page',
  topic: 'topic',
} as const;
export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType];

/** `actor_kind` */
export const ActorKind = {
  user: 'user',
  system: 'system',
  cli: 'cli',
} as const;
export type ActorKind = (typeof ActorKind)[keyof typeof ActorKind];
