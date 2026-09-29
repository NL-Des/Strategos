import type { Note } from '@strategos/shared';
import { apiFetch } from './client';

export type NoteInput = { title: string; content: string };

export const listNotes = () => apiFetch<Note[]>('/me/notes');
export const createNote = (body: NoteInput) =>
  apiFetch<Note>('/me/notes', { method: 'POST', body });
export const updateNote = (id: string, body: NoteInput) =>
  apiFetch<Note>(`/me/notes/${id}`, { method: 'PUT', body });
export const deleteNote = (id: string) => apiFetch<void>(`/me/notes/${id}`, { method: 'DELETE' });

/** Lecture par l'admin, depuis la fiche du compte : chaque appel est tracé. */
export const readUserNotes = (userId: string) => apiFetch<Note[]>(`/admin/users/${userId}/notes`);
