import type { TopicDetail } from '@strategos/shared';
import { apiFetch } from './client';

/** Modération (admin) : masquer, rétablir, épingler. */
export const hideMessage = (id: string) =>
  apiFetch<void>(`/admin/messages/${id}/hide`, { method: 'POST' });

export const unhideMessage = (id: string) =>
  apiFetch<void>(`/admin/messages/${id}/unhide`, { method: 'POST' });

export const pinTopic = (id: string, pinned: boolean) =>
  apiFetch<TopicDetail>(`/admin/topics/${id}`, { method: 'PATCH', body: { pinned } });
