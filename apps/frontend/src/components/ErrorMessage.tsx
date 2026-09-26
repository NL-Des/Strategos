import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';

/** Message traduit d'une erreur d'API (`errors.<CODE>`), avec les détails utiles. */
export function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;

  const code = error instanceof ApiRequestError ? error.code : 'INTERNAL_ERROR';
  const details = error instanceof ApiRequestError ? error.error.details : {};
  let text = t(`errors.${code}`);
  if (code === 'AUTH_TOO_MANY_ATTEMPTS' && typeof details.retryAfter === 'number') {
    text = t('errors.AUTH_TOO_MANY_ATTEMPTS_RETRY', {
      minutes: Math.ceil(details.retryAfter / 60),
    });
  }

  const fields = (details.fields ?? {}) as Record<string, string[]>;
  const fieldMessages = Object.entries(fields).map(
    ([field, constraints]) =>
      `${t(`fields.${field}`, { defaultValue: field })} : ${constraints
        .map((c) => t(`validation.${c}`, { defaultValue: t('validation.invalid') }))
        .join(', ')}`,
  );

  return (
    <div className="error" role="alert">
      <p>{text}</p>
      {fieldMessages.length > 0 && (
        <ul>
          {fieldMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
