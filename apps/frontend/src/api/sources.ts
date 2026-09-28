import type {
  AddSourceInput,
  OneDriveItem,
  OneDriveStatus,
  ServiceAccountInfo,
  SourceSummary,
} from '@strategos/shared';
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

// Sources connectées (08) : Google Sheets et OneDrive.
export const getServiceAccount = () =>
  apiFetch<ServiceAccountInfo>('/admin/sources/service-account');
/** Teste l'accès : un Sheet non partagé renvoie `SOURCE_UNAVAILABLE`. */
export const addSource = (body: AddSourceInput) =>
  apiFetch<SourceSummary>('/admin/sources', { method: 'POST', body });
export const testSource = (id: string) =>
  apiFetch<SourceSummary>(`/admin/sources/${id}/test`, { method: 'POST' });
export const getOneDriveStatus = () => apiFetch<OneDriveStatus>('/admin/onedrive/status');
export const browseOneDrive = (path: string) =>
  apiFetch<OneDriveItem[]>(`/admin/onedrive/browse?path=${encodeURIComponent(path)}`);
/** Lancement de la connexion Microsoft : navigation complète (redirection). */
export const oneDriveConnectUrl = '/api/v1/admin/onedrive/connect';
