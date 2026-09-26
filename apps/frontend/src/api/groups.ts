import type { GroupDetail, GroupPermissionInput, GroupSummary } from '@strategos/shared';
import { apiFetch } from './client';

export const listGroups = () => apiFetch<GroupSummary[]>('/admin/groups');
export const getGroup = (id: string) => apiFetch<GroupDetail>(`/admin/groups/${id}`);
export const createGroup = (body: { name: string; description?: string }) =>
  apiFetch<GroupDetail>('/admin/groups', { method: 'POST', body });
export const updateGroup = (
  id: string,
  body: { name: string; description: string; version: number },
) => apiFetch<GroupDetail>(`/admin/groups/${id}`, { method: 'PATCH', body });
export const deleteGroup = (id: string) =>
  apiFetch<void>(`/admin/groups/${id}`, { method: 'DELETE' });
export const replaceMembers = (id: string, userIds: string[]) =>
  apiFetch<GroupDetail>(`/admin/groups/${id}/members`, { method: 'PUT', body: { userIds } });
export const replacePermissions = (id: string, permissions: GroupPermissionInput[]) =>
  apiFetch<GroupDetail>(`/admin/groups/${id}/permissions`, {
    method: 'PUT',
    body: { permissions },
  });
