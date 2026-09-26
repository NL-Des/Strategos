import { EXCEL_MAX_BYTES, EXCEL_MIME, type SourceSummary } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { deleteSource, listSources, sourceDownloadUrl, uploadSource } from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';

interface InUse {
  source: SourceSummary;
  pages: { id: string; name: string }[];
  layouts: string[];
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

/**
 * Admin › Sources (04) : Excel uploadés, avec leur état, leurs dates et les
 * pages qui les utilisent. Google Sheets et OneDrive arrivent à l'étape 7.
 */
export function SourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [inUse, setInUse] = useState<InUse | null>(null);
  const sources = useQuery({ queryKey: ['admin', 'sources'], queryFn: listSources });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });

  const upload = useMutation({
    mutationFn: uploadSource,
    onSuccess: () => {
      if (fileInput.current) fileInput.current.value = '';
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: ({ source, confirm }: { source: SourceSummary; confirm: boolean }) =>
      deleteSource(source.id, confirm),
    onSuccess: () => {
      setInUse(null);
      void refresh();
    },
    onError: (error, { source }) => {
      if (error instanceof ApiRequestError && error.code === 'CONFIRMATION_REQUIRED') {
        const [warning] = (error.error.details.warnings ?? []) as Omit<InUse, 'source'>[];
        setInUse({ source, pages: warning?.pages ?? [], layouts: warning?.layouts ?? [] });
      }
    },
  });
  const removeError =
    remove.error instanceof ApiRequestError && remove.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : remove.error;

  return (
    <section>
      <h1>{t('sources.title')}</h1>
      <p className="muted">{t('sources.intro')}</p>
      <form
        className="card form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const file = fileInput.current?.files?.[0];
          if (file) upload.mutate(file);
        }}
      >
        <h2>{t('sources.upload')}</h2>
        <label>
          {t('fields.file')}
          <input ref={fileInput} type="file" required accept={`.xlsx,${EXCEL_MIME}`} />
          <small>{t('sources.limits', { mb: EXCEL_MAX_BYTES / 1024 / 1024 })}</small>
        </label>
        <ErrorMessage error={upload.error} />
        <button type="submit" disabled={upload.isPending}>
          {t('sources.uploadSubmit')}
        </button>
      </form>

      {inUse && (
        <div className="card warning" role="alertdialog" aria-labelledby="source-in-use">
          <p id="source-in-use">{t('warnings.SOURCE_IN_USE', { name: inUse.source.name })}</p>
          <ul>
            {inUse.pages.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {inUse.layouts.map((kind) => (
              <li key={kind}>{t(`builder.zoneNames.${kind}`)}</li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="danger"
              onClick={() => remove.mutate({ source: inUse.source, confirm: true })}
            >
              {t('sources.deleteAnyway')}
            </button>
            <button type="button" className="secondary" onClick={() => setInUse(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <ErrorMessage error={sources.error ?? removeError} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('sources.name')}</th>
              <th>{t('sources.type')}</th>
              <th>{t('sources.status')}</th>
              <th>{t('sources.lastImportedAt')}</th>
              <th>{t('sources.lastDownloadedAt')}</th>
              <th>{t('sources.usages')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sources.data?.map((source) => (
              <tr key={source.id}>
                <td>
                  {source.name}
                  <br />
                  <small>{t('sources.sheets', { sheets: source.sheets.join(', ') })}</small>
                </td>
                <td>{t(`sources.types.${source.type}`)}</td>
                <td>{t(`sources.statuses.${source.status}`)}</td>
                <td>{date(source.lastImportedAt)}</td>
                <td>{date(source.lastDownloadedAt)}</td>
                <td>
                  {source.usages.pages.map((p) => (
                    <Link key={p.id} to={`/admin/pages/${p.id}`} className="usage">
                      {p.name}
                    </Link>
                  ))}
                  {source.usages.layouts.map((kind) => (
                    <Link key={kind} to={`/admin/layout/${kind}`} className="usage">
                      {t(`builder.zoneNames.${kind}`)}
                    </Link>
                  ))}
                  {source.usages.pages.length + source.usages.layouts.length === 0 && '—'}
                </td>
                <td>
                  <div className="actions">
                    {source.type === 'upload' && (
                      <a
                        className="button secondary"
                        href={sourceDownloadUrl(source.id)}
                        download={source.name}
                        onClick={() => setTimeout(() => void refresh(), 1000)}
                      >
                        {t('sources.download')}
                      </a>
                    )}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (window.confirm(t('sources.deleteConfirm', { name: source.name }))) {
                          remove.mutate({ source, confirm: false });
                        }
                      }}
                    >
                      {t('sources.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sources.data?.length === 0 && <p className="muted">{t('sources.empty')}</p>}
    </section>
  );
}
