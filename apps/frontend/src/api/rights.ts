import type { ResourceRights, ResourceType, RightsMatrix } from '@strategos/shared';
import { apiFetch } from './client';

export interface MatrixQuery {
  page: number;
  pageSize?: number;
  group?: string;
  type?: ResourceType;
  user?: string;
}

export function getRightsMatrix({ page, pageSize = 50, group, type, user }: MatrixQuery) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (group) params.set('group', group);
  if (type) params.set('type', type);
  if (user) params.set('user', user);
  return apiFetch<RightsMatrix>(`/admin/rights/matrix?${params}`);
}

export const getResourceRights = (type: ResourceType, id: string) =>
  apiFetch<ResourceRights>(`/admin/rights/resources/${type}/${id}`);
