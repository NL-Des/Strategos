import type { Paginated, TrashItem, TrashType } from '@strategos/shared';
import { apiFetch } from './client';

export function listTrash(page: number, type?: TrashType): Promise<Paginated<TrashItem>> {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (type) params.set('type', type);
  return apiFetch(`/admin/trash?${params}`);
}

export const restoreFromTrash = (type: TrashType, id: string) =>
  apiFetch<void>(`/admin/trash/${type}/${id}/restore`, { method: 'POST' });
