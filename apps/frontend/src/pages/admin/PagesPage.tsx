import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { createPage, listPages } from '../../api/pages';
import { ErrorMessage } from '../../components/ErrorMessage';
import { EmptyState } from '../../components/EmptyState';

/** Admin › Pages : liste, état de publication, création. */
export function PagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => createPage(name),
    onSuccess: (page) => void navigate(`/admin/pages/${page.id}`),
  });

  return (
    <section>
      <h1>{t('builder.pages.title')}</h1>
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
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <ErrorMessage error={create.error} />
        <button type="submit" disabled={create.isPending}>
          {t('builder.pages.createSubmit')}
        </button>
      </form>
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
            {pages.data?.map((page) => (
              <tr key={page.id}>
                <td>
                  <Link to={`/admin/pages/${page.id}`}>{page.name}</Link>
                </td>
                <td>
                  {!page.publishedAt
                    ? t('builder.pages.neverPublished')
                    : page.hasDraftChanges
                      ? t('builder.pages.draftChanges')
                      : t('builder.pages.published')}
                </td>
                <td>
                  {new Date(page.updatedAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages.data?.length === 0 && <EmptyState>{t('builder.pages.empty')}</EmptyState>}
    </section>
  );
}
