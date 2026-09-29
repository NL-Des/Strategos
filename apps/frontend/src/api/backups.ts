import type { BackupSummary } from '@strategos/shared';
import { apiFetch } from './client';

export const listBackups = () => apiFetch<BackupSummary[]>('/admin/backups');

/** Téléchargement direct par le navigateur (lien), en flux. */
export const backupDownloadUrl = (id: string) => `/api/v1/admin/backups/${id}/download`;
