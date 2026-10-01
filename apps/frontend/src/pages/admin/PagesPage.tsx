import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { createPage, listPages } from '../../api/pages';
import { ErrorMessage } from '../../components/ErrorMessage';
import { EmptyState } from '../../components/EmptyState';
import { CreatePanel } from '../../components/CreatePanel';
import { formatDateTime } from '../../format';
import { matches } from '../../search';

/** Admin › Pages : liste, état de publication, création. */
export function PagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const shown = pages.data?.filter((page) => matches(page.name, q));
  const create = useMutation({
    mutationFn: () => createPage(name),
    onSuccess: (page) => void navigate(`/admin/pages/${page.id}`),
  });

  return (
    <section>
      <h1>{t('builder.pages.title')}</h1>
      <CreatePanel label={t('builder.pages.create')}>
        <form
          className="card form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>{t('builder.pages.create')}</h2>
          <label>
            {t('builder.pages.name')}
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ErrorMessage error={create.error} />
          <button type="submit" disabled={create.isPending}>
            {t('builder.pages.createSubmit')}
          </button>
        </form>
      </CreatePanel>
      <div className="filters">
        <input
          type="search"
          placeholder={t('builder.pages.search')}
          aria-label={t('builder.pages.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ErrorMessage error={pages.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('builder.pages.name')}</th>
              <th>{t('builder.pages.status')}</th>
              <th>{t('builder.pages.updatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {shown?.map((page) => (
              <tr key={page.id}>
                <td>
                  <Link to={`/admin/pages/${page.id}`}>{page.name}</Link>
                </td>
                <td>
                  <span
                    className={`status ${
                      !page.publishedAt
                        ? 'status-none'
                        : page.hasDraftChanges
                          ? 'status-pending'
                          : 'status-validated'
                    }`}
                  >
                    {!page.publishedAt
                      ? t('builder.pages.neverPublished')
                      : page.hasDraftChanges
                        ? t('builder.pages.draftChanges')
                        : t('builder.pages.published')}
                  </span>
                </td>
                <td>{formatDateTime(page.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown?.length === 0 && (
        <EmptyState icon="file">
          {t(pages.data?.length ? 'common.noMatch' : 'builder.pages.empty')}
        </EmptyState>
      )}
    </section>
  );
}
