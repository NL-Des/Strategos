import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { Notice } from './Notice';

/**
 * Chemin d'erreur du page builder rendu lisible :
 * `config.zones.main[0].columns[1].block.config.alt` → « Main, rangée 1, colonne 2 — Texte alternatif ».
 */
export function describeField(t: TFunction, path: string): string {
  const match =
    /^config\.(?:zones\.(main|sidebar)|rows)\[(\d+)\](?:\.columns(?:\[(\d+)\])?)?(?:\.block(?:\.config)?)?\.?(.*)$/.exec(
      path,
    );
  if (!match) return t(`fields.${path}`, { defaultValue: path });
  const [, zone, row, column, rest] = match;
  const field = rest?.split(/[.[]/).find((part) => part && !/^\d+\]?$/.test(part));
  return [
    [
      zone ? t(`builder.zoneNames.${zone}`) : null,
      t('builder.rowLabel', { n: Number(row) + 1 }),
      column !== undefined ? t('builder.columnLabel', { n: Number(column) + 1 }) : null,
    ]
      .filter(Boolean)
      .join(', '),
    field ? t(`fields.${field}`, { defaultValue: field }) : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

/** Message traduit d'une erreur d'API (`errors.<CODE>`), avec les détails utiles. */
export function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;

  const code = error instanceof ApiRequestError ? error.code : 'INTERNAL_ERROR';
  const details = error instanceof ApiRequestError ? error.error.details : {};
  let text = t(`errors.${code}`);
  if (code === 'AUTH_TOO_MANY_ATTEMPTS' && typeof details.retryAfter === 'number') {
    text =
      details.retryAfter < 60
        ? t('errors.AUTH_TOO_MANY_ATTEMPTS_RETRY_SECONDS', { seconds: details.retryAfter })
        : t('errors.AUTH_TOO_MANY_ATTEMPTS_RETRY', {
            minutes: Math.ceil(details.retryAfter / 60),
          });
  }

  const fields = (details.fields ?? {}) as Record<string, string[]>;
  const fieldMessages = Object.entries(fields).map(
    ([field, constraints]) =>
      `${describeField(t, field)} : ${[...new Set(constraints)]
        .map((c) => t(`validation.${c}`, { defaultValue: t('validation.invalid') }))
        .join(', ')}`,
  );

  return (
    <Notice tone="error" role="alert">
      <p>{text}</p>
      {fieldMessages.length > 0 && (
        <ul>
          {fieldMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {/* Conflit d'édition : seule issue, repartir de la version enregistrée. */}
      {code === 'EDIT_CONFLICT' && (
        <button type="button" className="secondary" onClick={() => window.location.reload()}>
          {t('common.reload')}
        </button>
      )}
    </Notice>
  );
}
