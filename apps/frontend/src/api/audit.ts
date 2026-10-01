import type { ActorKind, AuditEntry, Paginated } from '@strategos/shared';
import { apiFetch } from './client';

export interface AuditQuery {
  page: number;
  actorKind?: ActorKind;
  actorId?: string;
  action?: string;
  targetType?: string;
  /** Bornes ISO 8601 : début inclus, fin exclue. */
  from?: string;
  to?: string;
}

export function listAudit({ page, ...filters }: AuditQuery): Promise<Paginated<AuditEntry>> {
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return apiFetch(`/admin/audit?${params}`);
}
