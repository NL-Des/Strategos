import { useTranslation } from 'react-i18next';

/** Précédent / page x sur y / Suivant ; rien s'il n'y a qu'une page. */
export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage === 1) return null;
  return (
    <div className="pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('common.previous')}
      </button>
      <span>{t('common.pageOf', { page, total: lastPage })}</span>
      <button type="button" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        {t('common.next')}
      </button>
    </div>
  );
}
