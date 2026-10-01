import type { SubmissionValue } from '@strategos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listMySubmissions } from '../api/forms';
import { ErrorMessage } from '../components/ErrorMessage';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { formatDateTime } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';

const show = (value: SubmissionValue) =>
  value === null ? '—' : typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value);

/**
 * « Mes soumissions » (09 — Suivi des soumissions) : ses propositions et leur
 * statut. Rien n'est poussé : l'information est consultable ici.
 */
export function MySubmissionsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const submissions = useQuery({
    queryKey: ['me', 'submissions', page],
    queryFn: () => listMySubmissions(page),
    placeholderData: keepPreviousData,
  });
  useDocumentTitle(t('submissions.mine.title'));
  return (
    <section>
      <h1>{t('submissions.mine.title')}</h1>
      <ErrorMessage error={submissions.error} />
      {submissions.isPending && <Loading />}
      {submissions.data?.items.map((s) => (
        <article key={s.id} className="card submission-item">
          <header className="submission-header">
            <strong>{s.formTitle}</strong>
            <span className={`status status-${s.status}`}>
              {t(`submissions.status.${s.status}`)}
            </span>
            <span className="muted">{formatDateTime(s.submittedAt)}</span>
          </header>
          <dl className="submission-values">
            {Object.entries(s.values).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{show(value)}</dd>
              </div>
            ))}
          </dl>
          {s.decidedAt && (
            <p className="muted">
              {t('submissions.decidedAt', { date: formatDateTime(s.decidedAt) })}
            </p>
          )}
          {s.reason && (
            <p>
              {t('submissions.reason', {
                reason: t(`submissions.reasons.${s.reason}`, { defaultValue: s.reason }),
              })}
            </p>
          )}
        </article>
      ))}
      {submissions.data?.total === 0 && <EmptyState>{t('submissions.mine.empty')}</EmptyState>}
      {submissions.data && (
        <Pagination
          page={page}
          total={submissions.data.total}
          pageSize={submissions.data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  );
}
