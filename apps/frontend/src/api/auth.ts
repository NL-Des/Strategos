import type { Me } from '@strategos/shared';
import { ApiRequestError, apiFetch, resetCsrfToken } from './client';

/** Utilisateur courant, ou `null` sans session. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiFetch<Me>('/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function login(username: string, password: string): Promise<Me> {
  const me = await apiFetch<Me>('/auth/login', { method: 'POST', body: { username, password } });
  resetCsrfToken();
  return me;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
  resetCsrfToken();
}

export function changeCredentials(body: {
  currentPassword: string;
  newPassword: string;
  newUsername?: string;
}): Promise<Me> {
  return apiFetch<Me>('/auth/change-credentials', { method: 'POST', body });
}
