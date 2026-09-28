import type {
  AdminForm,
  FormDefinition,
  FormMode,
  FormPrefill,
  FormSettingsInput,
  Paginated,
  PublishPreview,
  ReimportMode,
  ReimportPreview,
  SaveFormDraftResult,
  Submission,
  SubmissionQueueItem,
  SubmissionStatus,
  SubmissionValues,
  UserForm,
} from '@strategos/shared';
import { apiFetch } from './client';

/** Adresse donnée par la page assemblée (`formUrl`, `submitUrl`) → chemin de l'API. */
const apiPath = (url: string) => url.replace(/^\/api\/v1/, '');

// Côté utilisateur.
export const getUserForm = (formUrl: string) => apiFetch<UserForm>(apiPath(formUrl));
export const getPrefill = (formUrl: string, rowKey: string) =>
  apiFetch<FormPrefill>(`${apiPath(formUrl)}/prefill?rowKey=${encodeURIComponent(rowKey)}`);
export const submitForm = (
  submitUrl: string,
  body: { values: SubmissionValues; rowKey?: string },
) => apiFetch<Submission>(apiPath(submitUrl), { method: 'POST', body });
export const listMySubmissions = (page: number) =>
  apiFetch<Paginated<Submission>>(`/me/submissions?page=${page}&pageSize=25`);

// Côté admin : formulaires.
export const createForm = (body: { pageId: string; pageBlockId: string; mode: FormMode }) =>
  apiFetch<AdminForm>('/admin/forms', { method: 'POST', body });
export const getAdminForm = (id: string) => apiFetch<AdminForm>(`/admin/forms/${id}`);
export const saveFormDraft = (id: string, body: { definition: FormDefinition; version: number }) =>
  apiFetch<SaveFormDraftResult>(`/admin/forms/${id}/draft`, { method: 'PUT', body });
export const setFormOpen = (id: string, open: boolean) =>
  apiFetch<AdminForm>(`/admin/forms/${id}/${open ? 'open' : 'close'}`, { method: 'POST' });
/** Activer la validation automatique sur une cellule-formule renvoie `409 CONFIRMATION_REQUIRED`. */
export const setFormSettings = (id: string, body: FormSettingsInput) =>
  apiFetch<AdminForm>(`/admin/forms/${id}/settings`, { method: 'PATCH', body });

// Côté admin : publication d'une page.
export const getPublishPreview = (pageId: string) =>
  apiFetch<PublishPreview>(`/admin/pages/${pageId}/publish/preview`);

// Côté admin : soumissions.
export interface QueueFilters {
  status?: SubmissionStatus | '';
  formId?: string;
  pageId?: string;
  userId?: string;
  from?: string;
  to?: string;
  sort?: 'createdAt:asc' | 'createdAt:desc';
}

export function listSubmissions(filters: QueueFilters, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return apiFetch<Paginated<SubmissionQueueItem>>(`/admin/submissions?${params}`);
}
export const pendingCount = () => apiFetch<{ count: number }>('/admin/submissions/count');
export const validateSubmission = (id: string, confirm = false) =>
  apiFetch<Submission>(`/admin/submissions/${id}/validate`, { method: 'POST', body: { confirm } });
export const modifySubmission = (id: string, values: SubmissionValues, confirm = false) =>
  apiFetch<Submission>(`/admin/submissions/${id}/modify`, {
    method: 'POST',
    body: { values, confirm },
  });
export const rejectSubmission = (id: string, reason: string) =>
  apiFetch<Submission>(`/admin/submissions/${id}/reject`, { method: 'POST', body: { reason } });

// Côté admin : réimport d'un Excel uploadé.
export function previewReimport(sourceId: string, file: File): Promise<ReimportPreview> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/admin/sources/${sourceId}/reimport/preview`, { method: 'POST', body: form });
}
export const confirmReimport = (sourceId: string, reimportToken: string, mode: ReimportMode) =>
  apiFetch<void>(`/admin/sources/${sourceId}/reimport/confirm`, {
    method: 'POST',
    body: { reimportToken, mode },
  });
