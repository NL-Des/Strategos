import type { Theme, ThemeConfig } from '@strategos/shared';
import { apiFetch } from './client';

export const listThemes = () => apiFetch<Theme[]>('/admin/themes');
export const getTheme = (id: string) => apiFetch<Theme>(`/admin/themes/${id}`);
export const createTheme = (body: { name: string; config: ThemeConfig }) =>
  apiFetch<Theme>('/admin/themes', { method: 'POST', body });
export const updateTheme = (
  id: string,
  body: { name: string; config: ThemeConfig; version: number },
) => apiFetch<Theme>(`/admin/themes/${id}`, { method: 'PUT', body });
export const deleteTheme = (id: string) =>
  apiFetch<void>(`/admin/themes/${id}`, { method: 'DELETE' });
