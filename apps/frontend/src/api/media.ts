import type { MediaItem, Paginated } from '@strategos/shared';
import { apiFetch } from './client';

export function listMedia(page: number, q?: string, pageSize = 50): Promise<Paginated<MediaItem>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  return apiFetch(`/admin/media?${params}`);
}

export function uploadMedia(file: File, alt: string): Promise<MediaItem> {
  const form = new FormData();
  form.append('file', file);
  if (alt) form.append('alt', alt);
  return apiFetch('/admin/media', { method: 'POST', body: form });
}

/** Sans `confirm`, une image encore utilisée renvoie `409 CONFIRMATION_REQUIRED`. */
export const deleteMedia = (id: string, confirm = false) =>
  apiFetch<void>(`/admin/media/${id}`, { method: 'DELETE', body: { confirm } });
