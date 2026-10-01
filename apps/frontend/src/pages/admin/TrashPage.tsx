import { TRASH_TYPES, type TrashItem, type TrashType } from '@strategos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTrash, restoreFromTrash } from '../../api/trash';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Pagination } from '../../components/Pagination';
import { EmptyState } from '../../components/EmptyState';

/** Admin › Corbeille (04) : éléments supprimés, filtrables par type, restaurables. */
export function TrashPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<TrashType | ''>('');
  const [restored, setRestored] = useState<TrashItem | null>(null);
  const trash = useQuery({
    queryKey: ['admin', 'trash', page, type],
    queryFn: () => listTrash(page, type || undefined),
    placeholderData: keepPreviousData,
  });
  const restore = useMutation({
    mutationFn: (item: TrashItem) => restoreFromTrash(item.type, item.id),
    onSuccess: (_void, item) => {
      setRestored(item);
      // Ce qui est restauré reparaît dans les autres écrans (pages, comptes, groupes…).
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return (
    <section>
      <h1>{t('trash.title')}</h1>
      <p className="muted">{t('trash.intro')}</p>

      <div className="filters">
        <select
          aria-label={t('trash.type')}
          value={type}
          onChange={(e) => {
            setType(e.target.value as TrashType | '');
            setPage(1);
          }}
        >
          <option value="">{t('trash.allTypes')}</option>
          {TRASH_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`trash.types.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {restored && (
        <p className="notice" role="status">
          {t(restored.type === 'form' ? 'trash.restoredForm' : 'trash.restored', {
            label: restored.label,
          })}
        </p>
      )}
      <ErrorMessage error={trash.error ?? restore.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('trash.type')}</th>
              <th>{t('trash.item')}</th>
              <th>{t('trash.context')}</th>
              <th>{t('trash.deletedAt')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trash.data?.items.map((item) => (
              <tr key={`${item.type}-${item.id}`}>
                <td>{t(`trash.types.${item.type}`)}</td>
                <td>
                  <strong>{item.label || t('trash.untitled')}</strong>
                  {item.author && (
                    <small className="block">{t('trash.by', { author: item.author })}</small>
                  )}
                </td>
                <td>{item.context}</td>
                <td>
                  {new Date(item.deletedAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    disabled={restore.isPending}
                    onClick={() => {
                      setRestored(null);
                      restore.mutate(item);
                    }}
                  >
                    {t('trash.restore')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trash.data?.items.length === 0 && <EmptyState>{t('trash.empty')}</EmptyState>}
      {trash.data && (
        <Pagination
          page={page}
          total={trash.data.total}
          pageSize={trash.data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  );
}
