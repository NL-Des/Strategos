import type { InstanceSettings, Theme } from '@strategos/shared';
import { apiFetch } from './client';

export const getSettings = () => apiFetch<InstanceSettings>('/admin/settings');
export const updateSettings = (body: InstanceSettings) =>
  apiFetch<InstanceSettings>('/admin/settings', { method: 'PUT', body });
export const listThemes = () => apiFetch<Theme[]>('/admin/themes');
