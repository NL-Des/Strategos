import type { Profile } from '@strategos/shared';
import { apiFetch } from './client';

export const getProfile = () => apiFetch<Profile>('/me/profile');
export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  apiFetch<void>('/me/password', { method: 'PUT', body });
