import type {
  AssembledCatalogBlock,
  AssembledTableBlock,
  CatalogCard,
  RowCell,
  RowFormLink,
  TableRow,
} from '@strategos/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRows } from '../api/pages';
import { ErrorMessage } from '../components/ErrorMessage';
import { Pagination } from '../components/Pagination';
import { RowFormButtons, RowFormLinks, RowFormPanel } from './FormBlock';
import { Icon } from '../components/Icon';

/** Source injoignable : le module l'annonce, le reste de la page s'affiche. */
export function SourceUnavailable() {
  const { t } = useTranslation();
  return (
    <p className="block-unavailable" role="status">
      {t('render.sourceUnavailable')}
    </p>
  );
}

/** Indicateur « à recalculer » (08) : valeur d'un Excel uploadé qui dépend d'une valeur écrite. */
export function RecalcMark() {
  const { t } = useTranslation();
  return (
    <span
      className="needs-recalc"
      title={t('render.needsRecalc')}
      aria-label={t('render.needsRecalc')}
    >
      *
    </span>
  );
}

function Cell({ cell }: { cell: RowCell }) {
  const { t } = useTranslation();
  let content: ReactNode = cell.value;
  if (cell.href) {
    content = (
      <a href={cell.href} target="_blank" rel="noopener noreferrer">
        {cell.value}
      </a>
    );
  }
  if (cell.image !== undefined)
    content = <CardImage src={cell.image} alt={t('render.image')} small />;
  return (
    <>
      {content}
      {cell.needsRecalc && <RecalcMark />}
    </>
  );
}

/** Image d'une carte ; introuvable → image par défaut (06 — Catalogue). */
function CardImage({ src, alt, small }: { src: string | null; alt: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = small ? 'cell-image' : 'card-image';
  if (!src || failed)
    return <div className={`${className} image-placeholder`} role="img" aria-label={alt} />;
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

function useRows<T>(rowsUrl: string, sort: string | undefined, q: string, page: number) {
  return useQuery({
    queryKey: ['rows', rowsUrl, { page, sort, q }],
    queryFn: () => fetchRows<T>(rowsUrl, { page, sort, q: q.trim() || undefined }),
    placeholderData: keepPreviousData,
  });
}

/** Délai après la dernière frappe avant de lancer la recherche. */
const SEARCH_DELAY_MS = 300;

/** Recherche : la saisie s'affiche aussitôt, la requête part quand la frappe s'arrête. */
function Search({ onChange }: { onChange: (q: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => onChange(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // `onChange` change à chaque rendu : seul le texte relance le délai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <input
      type="search"
      className="block-search"
      placeholder={t('render.search')}
      aria-label={t('render.search')}
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

/** Tableau (06) : paginé, triable et filtrable ; tout est fait par le backend. */
export function TableBlock({ block }: { block: AssembledTableBlock }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: number; dir: 'asc' | 'desc' } | null>(null);
  // Formulaire de ligne ouvert : affiché sous la ligne, sur toute la largeur du tableau.
  const [openForm, setOpenForm] = useState<{ row: number; form: RowFormLink } | null>(null);
  const rows = useRows<TableRow>(
    block.rowsUrl,
    sort ? `${sort.col}:${sort.dir}` : undefined,
    q,
    page,
  );
  if (block.error) return <SourceUnavailable />;
  const { columns, sortable, searchable } = block.config;
  const goTo = (next: number) => {
    setOpenForm(null);
    setPage(next);
  };

  return (
    <div className="block-table">
      {searchable && (
        <Search
          onChange={(value) => {
            if (value === q) return;
            setQ(value);
            goTo(1);
          }}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column, i) => (
                <th
                  key={i}
                  className={`format-${column.format}`}
                  aria-sort={
                    sort?.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="link sort"
                      onClick={() => {
                        setOpenForm(null);
                        setSort({
                          col: i,
                          dir: sort?.col === i && sort.dir === 'asc' ? 'desc' : 'asc',
                        });
                      }}
                    >
                      {column.label}
                      {sort?.col === i && (
                        <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={14} />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
              {block.rowForms.length > 0 && (
                <th>
                  <span className="visually-hidden">{t('render.actions')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.data?.items.map((row, r) => (
              <Fragment key={r}>
                <tr>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={`format-${columns[i]?.format ?? 'text'}`}>
                      <Cell cell={cell} />
                    </td>
                  ))}
                  {block.rowForms.length > 0 && (
                    <td>
                      <RowFormLinks
                        forms={block.rowForms}
                        rowKeys={row.rowKeys}
                        open={openForm?.row === r ? openForm.form : null}
                        onToggle={(form) => setOpenForm(form && { row: r, form })}
                      />
                    </td>
                  )}
                </tr>
                {openForm?.row === r && (
                  <tr className="row-form-row">
                    <td colSpan={columns.length + 1}>
                      <RowFormPanel
                        form={openForm.form}
                        rowKey={row.rowKeys?.[openForm.form.formId]}
                        onClose={() => setOpenForm(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {rows.data?.total === 0 && <p className="muted">{t('render.noRows')}</p>}
      <ErrorMessage error={rows.error} />
      {rows.data && rows.data.total > rows.data.pageSize && (
        <Pagination
          page={page}
          total={rows.data.total}
          pageSize={rows.data.pageSize}
          onChange={goTo}
        />
      )}
    </div>
  );
}

/** Catalogue (06) : une carte par ligne ; sur mobile, une carte par rangée (CSS). */
export function CatalogBlock({ block }: { block: AssembledCatalogBlock }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const rows = useRows<CatalogCard>(block.rowsUrl, undefined, q, page);
  if (block.error) return <SourceUnavailable />;
  const { layout, hasImage, detailLabels, perRow, searchable } = block.config;

  return (
    <div className="block-catalog">
      {searchable && (
        <Search
          onChange={(value) => {
            if (value === q) return;
            setQ(value);
            setPage(1);
          }}
        />
      )}
      {/* Sur mobile la liste est longue : la pagination est aussi proposée en haut. */}
      {rows.data && (
        <Pagination
          page={page}
          total={rows.data.total}
          pageSize={rows.data.pageSize}
          onChange={setPage}
        />
      )}
      <div className={`catalog-grid per-row-${perRow}`}>
        {rows.data?.items.map((card, i) => (
          <article key={i} className={`catalog-card ${layout}`}>
            {hasImage && <CardImage src={card.image} alt={card.title?.value ?? ''} />}
            <div className="card-body">
              {card.title && (
                <h3>
                  <Cell cell={card.title} />
                </h3>
              )}
              {card.subtitle && (
                <p className="card-subtitle">
                  <Cell cell={card.subtitle} />
                </p>
              )}
              {card.details.length > 0 && (
                <dl>
                  {card.details.map((detail, d) => (
                    <div key={d}>
                      <dt>{detailLabels[d]}</dt>
                      <dd>
                        <Cell cell={detail} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <RowFormButtons forms={block.rowForms} rowKeys={card.rowKeys} />
            </div>
          </article>
        ))}
      </div>
      {rows.data?.total === 0 && <p className="muted">{t('render.noRows')}</p>}
      <ErrorMessage error={rows.error} />
      {rows.data && rows.data.total > rows.data.pageSize && (
        <Pagination
          page={page}
          total={rows.data.total}
          pageSize={rows.data.pageSize}
          onChange={setPage}
        />
      )}
    </div>
  );
}
