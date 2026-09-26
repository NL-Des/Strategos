import type { Paginated, UserDetail, UserStatus, UserSummary } from '@strategos/shared';
import { apiFetch } from './client';

export interface UserListQuery {
  page: number;
  pageSize?: number;
  q?: string;
  status?: UserStatus;
  groupId?: string;
}

export function listUsers({
  page,
  pageSize = 50,
  q,
  status,
  groupId,
}: UserListQuery): Promise<Paginated<UserSummary>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (groupId) params.set('groupId', groupId);
  return apiFetch(`/admin/users?${params}`);
}

export const getUser = (id: string) => apiFetch<UserDetail>(`/admin/users/${id}`);

export const createUser = (body: { username: string; temporaryPassword: string }) =>
  apiFetch<UserDetail>('/admin/users', { method: 'POST', body });

export const updateUser = (
  id: string,
  body: { username: string; personalPageId: string | null; version: number },
) => apiFetch<UserDetail>(`/admin/users/${id}`, { method: 'PATCH', body });

export const replaceUserGroups = (id: string, groupIds: string[]) =>
  apiFetch<UserDetail>(`/admin/users/${id}/groups`, { method: 'PUT', body: { groupIds } });

export const resetPassword = (id: string, temporaryPassword: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}/reset-password`, {
    method: 'POST',
    body: { temporaryPassword },
  });

export const disableUser = (id: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}/disable`, { method: 'POST' });

export const enableUser = (id: string) =>
  apiFetch<UserDetail>(`/admin/users/${id}/enable`, { method: 'POST' });

export const deleteUser = (id: string) =>
  apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE' });
