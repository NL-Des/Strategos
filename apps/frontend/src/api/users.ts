import type { Paginated, UserDetail, UserStatus, UserSummary } from '@strategos/shared';
import { apiFetch } from './client';

export interface UserListQuery {
  page: number;
  q?: string;
  status?: UserStatus;
}

export function listUsers({ page, q, status }: UserListQuery): Promise<Paginated<UserSummary>> {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  return apiFetch(`/admin/users?${params}`);
}

export const getUser = (id: string) => apiFetch<UserDetail>(`/admin/users/${id}`);

export const createUser = (body: { username: string; temporaryPassword: string }) =>
  apiFetch<UserDetail>('/admin/users', { method: 'POST', body });

export const renameUser = (id: string, body: { username: string; version: number }) =>
  apiFetch<UserDetail>(`/admin/users/${id}`, { method: 'PATCH', body });

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
