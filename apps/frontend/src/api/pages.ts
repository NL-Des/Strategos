import type {
  AdminLayoutPart,
  AdminPage,
  AdminPageSummary,
  AssembledLayout,
  AssembledPage,
  AssembledRow,
  LayoutConfig,
  LayoutKind,
  PageConfig,
} from '@strategos/shared';
import { apiFetch } from './client';

// Côté utilisateur.
export const getPage = (id: string) => apiFetch<AssembledPage>(`/pages/${id}`);
export const getLayout = () => apiFetch<AssembledLayout>('/layout');

// Côté admin : pages.
export const listPages = () => apiFetch<AdminPageSummary[]>('/admin/pages');
export const createPage = (name: string) =>
  apiFetch<AdminPage>('/admin/pages', { method: 'POST', body: { name } });
export const getAdminPage = (id: string) => apiFetch<AdminPage>(`/admin/pages/${id}`);
export const savePageDraft = (
  id: string,
  body: { name: string; config: PageConfig; version: number },
) => apiFetch<AdminPage>(`/admin/pages/${id}/draft`, { method: 'PUT', body });
export const previewPage = (id: string) => apiFetch<AssembledPage>(`/admin/pages/${id}/preview`);
export const publishPage = (id: string) =>
  apiFetch<AdminPage>(`/admin/pages/${id}/publish`, { method: 'POST' });
export const deletePage = (id: string) =>
  apiFetch<void>(`/admin/pages/${id}`, { method: 'DELETE' });

// Côté admin : header et footer partagés.
export const getLayoutPart = (kind: LayoutKind) =>
  apiFetch<AdminLayoutPart>(`/admin/layout/${kind}/draft`);
export const saveLayoutDraft = (
  kind: LayoutKind,
  body: { config: LayoutConfig; version: number },
) => apiFetch<AdminLayoutPart>(`/admin/layout/${kind}/draft`, { method: 'PUT', body });
export const previewLayout = (kind: LayoutKind) =>
  apiFetch<AssembledRow[]>(`/admin/layout/${kind}/preview`);
export const publishLayout = (kind: LayoutKind) =>
  apiFetch<AdminLayoutPart>(`/admin/layout/${kind}/publish`, { method: 'POST' });
