import type { AuditEntry } from '@strategos/shared';
import type { TFunction } from 'i18next';

type State = Record<string, unknown> | null;

function asState(value: unknown): State {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function formatValue(t: TFunction, key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
  if (key === 'status') return t(`admin.users.status_${String(value)}`);
  return String(value);
}

/** Nom lisible de la cible (ex. le pseudo d'un compte), tiré de l'état après ou avant. */
export function targetLabel(entry: AuditEntry): string {
  const state = asState(entry.after) ?? asState(entry.before);
  const label = state?.username ?? state?.title ?? state?.name;
  return typeof label === 'string' ? label : (entry.targetId ?? '');
}

/** Changements « champ : avant → après » ; à la création, les valeurs initiales. */
export function describeChanges(t: TFunction, entry: AuditEntry): string[] {
  const before = asState(entry.before);
  const after = asState(entry.after);
  if (!after) return [];
  return Object.keys(after)
    .filter((key) => !before || JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => {
      const field = t(`audit.fields.${key}`, { defaultValue: key });
      const next = formatValue(t, key, after[key]);
      return before
        ? `${field} : ${formatValue(t, key, before[key])} → ${next}`
        : `${field} : ${next}`;
    });
}
