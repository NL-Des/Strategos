import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiRequestError, apiFetch } from './api/client';

export function App() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ status: 'ok' }>('/health'),
  });

  let status = t('health.checking');
  if (health.isSuccess) status = t('health.ok');
  if (health.error) {
    const code = health.error instanceof ApiRequestError ? health.error.code : 'INTERNAL_ERROR';
    status = t('health.error', { message: t(`errors.${code}`) });
  }

  return (
    <main>
      <h1>{t('app.name')}</h1>
      <p role="status">{status}</p>
    </main>
  );
}
