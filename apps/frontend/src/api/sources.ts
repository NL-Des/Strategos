import type { SourceSummary } from '@strategos/shared';
import { apiFetch } from './client';

export const listSources = () => apiFetch<SourceSummary[]>('/admin/sources');

export function uploadSource(file: File): Promise<SourceSummary> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/admin/sources/upload', { method: 'POST', body: form });
}

/** Adresse de téléchargement de la version de référence (lien direct, avec la session). */
export const sourceDownloadUrl = (id: string) => `/api/v1/admin/sources/${id}/download`;

/** Sans `confirm`, une source encore utilisée renvoie `409 CONFIRMATION_REQUIRED`. */
export const deleteSource = (id: string, confirm = false) =>
  apiFetch<void>(`/admin/sources/${id}`, { method: 'DELETE', body: { confirm } });
