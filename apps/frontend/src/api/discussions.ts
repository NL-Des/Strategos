import type {
  AttachmentRef,
  EditMessageInput,
  OpenTopicInput,
  Paginated,
  PatchTopicInput,
  PostMessageInput,
  TopicDetail,
  TopicMessageView,
  TopicSummary,
  TopicWithMessages,
} from '@strategos/shared';
import { apiFetch } from './client';

/** Adresse donnée par la page assemblée (`topicsUrl`) → chemin de l'API. */
const apiPath = (url: string) => url.replace(/^\/api\/v1/, '');

export function listTopics(topicsUrl: string, page: number): Promise<Paginated<TopicSummary>> {
  return apiFetch(`${apiPath(topicsUrl)}?page=${page}&pageSize=50`);
}

export const openTopic = (topicsUrl: string, body: OpenTopicInput) =>
  apiFetch<TopicDetail>(apiPath(topicsUrl), { method: 'POST', body });

export const getTopic = (topicId: string, page: number) =>
  apiFetch<TopicWithMessages>(`/topics/${topicId}?page=${page}&pageSize=50`);

export const patchTopic = (topicId: string, body: PatchTopicInput) =>
  apiFetch<TopicDetail>(`/topics/${topicId}`, { method: 'PATCH', body });

export const postMessage = (topicId: string, body: PostMessageInput) =>
  apiFetch<TopicMessageView>(`/topics/${topicId}/messages`, { method: 'POST', body });

export const editMessage = (messageId: string, body: EditMessageInput) =>
  apiFetch<TopicMessageView>(`/messages/${messageId}`, { method: 'PUT', body });

export const deleteMessage = (messageId: string) =>
  apiFetch<void>(`/messages/${messageId}`, { method: 'DELETE' });

export function uploadAttachment(file: File): Promise<AttachmentRef> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/attachments', { method: 'POST', body: form });
}
