import type { AuditEntry } from '@strategos/shared';
import type { TFunction } from 'i18next';

type State = Record<string, unknown> | null;

function asState(value: unknown): State {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Le champ `status` n'a pas le même vocabulaire selon la cible (compte, soumission…). */
function formatStatus(t: TFunction, targetType: string, value: unknown): string {
  const status = String(value);
  const key =
    targetType === 'submission' ? `submissions.status.${status}` : `admin.users.status_${status}`;
  return t(key, { defaultValue: status });
}

function formatValue(t: TFunction, targetType: string, key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
  if (key === 'status') return formatStatus(t, targetType, value);
  if (key === 'kind')
    return t(`builder.zoneNames.${String(value)}`, { defaultValue: String(value) });
  if (Array.isArray(value))
    return value.map((item) => formatValue(t, targetType, '', item)).join(', ') || '—';
  // Valeur composée (ex. les valeurs d'une soumission) : « champ = valeur ; … ».
  if (typeof value === 'object')
    return (
      Object.entries(value)
        .map(([k, v]) => `${k} = ${formatValue(t, targetType, k, v)}`)
        .join(' ; ') || '—'
    );
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
      const next = formatValue(t, entry.targetType, key, after[key]);
      return before
        ? `${field} : ${formatValue(t, entry.targetType, key, before[key])} → ${next}`
        : `${field} : ${next}`;
    });
}
