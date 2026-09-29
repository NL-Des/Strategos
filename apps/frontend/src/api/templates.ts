import type { InstantiateResult, TemplateSummary, TemplateType } from '@strategos/shared';
import { apiFetch } from './client';

export const listTemplates = (type?: TemplateType) =>
  apiFetch<TemplateSummary[]>(`/admin/templates${type ? `?type=${type}` : ''}`);
export const createTemplate = (body: { type: TemplateType; sourceId: string; name: string }) =>
  apiFetch<TemplateSummary>('/admin/templates', { method: 'POST', body });
export const deleteTemplate = (id: string) =>
  apiFetch<void>(`/admin/templates/${id}`, { method: 'DELETE' });

/** Page : `name` ; formulaire : `pageId` et `pageBlockId` ; sujet : `spaceId`. */
export const instantiateTemplate = (
  id: string,
  body: { name?: string; pageId?: string; pageBlockId?: string; spaceId?: string },
) => apiFetch<InstantiateResult>(`/admin/templates/${id}/instantiate`, { method: 'POST', body });
