import type { ChatMessageView, EditChatMessageInput } from '@strategos/shared';
import { apiFetch } from './client';

/** Adresse donnée par la page assemblée (`messagesUrl`) → chemin de l'API. */
const apiPath = (url: string) => url.replace(/^\/api\/v1/, '');

/** Historique du chat par curseur (`before`/`after`, `limit`), en ordre chronologique. */
export function chatHistory(
  messagesUrl: string,
  params: { before?: string; after?: string; limit?: number } = {},
): Promise<ChatMessageView[]> {
  const q = new URLSearchParams();
  if (params.before) q.set('before', params.before);
  if (params.after) q.set('after', params.after);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return apiFetch(`${apiPath(messagesUrl)}${qs ? `?${qs}` : ''}`);
}

export const editChatMessage = (id: string, body: EditChatMessageInput) =>
  apiFetch<ChatMessageView>(`/chat-messages/${id}`, { method: 'PUT', body });

export const deleteChatMessage = (id: string) =>
  apiFetch<void>(`/chat-messages/${id}`, { method: 'DELETE' });

/** Modération (admin) : masquer ou rétablir un message de chat. */
export const hideChatMessage = (id: string) =>
  apiFetch<void>(`/admin/chat-messages/${id}/hide`, { method: 'POST' });

export const unhideChatMessage = (id: string) =>
  apiFetch<void>(`/admin/chat-messages/${id}/unhide`, { method: 'POST' });
