import {
  EXCEL_MAX_BYTES,
  EXCEL_MIME,
  formulaToFr,
  type ReimportMode,
  type ReimportPreview,
  type SourceSummary,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { confirmReimport, previewReimport } from '../../api/forms';
import {
  deleteSource,
  listSources,
  sourceDownloadUrl,
  testSource,
  uploadSource,
} from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';
import { GoogleSheetsPanel, OneDrivePanel } from './ConnectedSources';

interface InUse {
  source: SourceSummary;
  pages: { id: string; name: string }[];
  layouts: string[];
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

/** Contenu d'une cellule au réimport ; la formule d'une modification de la grille, en français. */
const shownValue = (value: string | null, edit: boolean) =>
  value === null ? '∅' : edit && value.startsWith('=') ? `=${formulaToFr(value.slice(1))}` : value;

/**
 * Admin › Sources (04) : Excel uploadés, avec leur état, leurs dates et les
 * pages qui les utilisent : Excel uploadés, Google Sheets et fichiers OneDrive.
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
  const [reimport, setReimport] = useState<{
    source: SourceSummary;
    preview: ReimportPreview;
  } | null>(null);
  const reimportPreview = useMutation({
    mutationFn: ({ source, file }: { source: SourceSummary; file: File }) =>
      previewReimport(source.id, file).then((preview) => ({ source, preview })),
    onSuccess: setReimport,
  });
  const reimportConfirm = useMutation({
    mutationFn: (mode: ReimportMode) =>
      confirmReimport(reimport!.source.id, reimport!.preview.reimportToken, mode),
    onSuccess: () => {
      setReimport(null);
      void refresh();
    },
  });
  const test = useMutation({
    mutationFn: (source: SourceSummary) => testSource(source.id),
    onSettled: () => void refresh(),
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
      <GoogleSheetsPanel />
      <OneDrivePanel />

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

      {reimport && (
        <div className="card warning" role="alertdialog" aria-labelledby="reimport-title">
          <h2 id="reimport-title">{t('sources.reimport.title', { name: reimport.source.name })}</h2>
          {reimport.preview.lostValidations.length === 0 ? (
            <p>{t('sources.reimport.nothingLost')}</p>
          ) : (
            <>
              <p>
                {t('sources.reimport.lost', {
                  count: reimport.preview.lostValidations.length,
                  date: date(reimport.preview.lastDownloadedAt),
                })}
              </p>
              <ul>
                {reimport.preview.lostValidations.map((l) => (
                  <li key={`${l.submissionId ?? l.editId}${l.cell}`}>
                    {t(l.editId ? 'sources.reimport.itemEdit' : 'sources.reimport.item', {
                      cell: l.cell,
                      before: shownValue(l.valueInNewFile, !!l.editId),
                      after: shownValue(l.validatedValue, !!l.editId),
                      date: date(l.validatedAt),
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
          <ErrorMessage error={reimportConfirm.error} />
          <div className="actions">
            {reimport.preview.lostValidations.length > 0 && (
              <button
                type="button"
                disabled={reimportConfirm.isPending}
                onClick={() => reimportConfirm.mutate('reapply')}
              >
                {t('sources.reimport.reapply')}
              </button>
            )}
            <button
              type="button"
              className={reimport.preview.lostValidations.length > 0 ? 'danger' : undefined}
              disabled={reimportConfirm.isPending}
              onClick={() => reimportConfirm.mutate('overwrite')}
            >
              {t(
                reimport.preview.lostValidations.length > 0
                  ? 'sources.reimport.overwrite'
                  : 'sources.reimport.confirm',
              )}
            </button>
            <button type="button" className="secondary" onClick={() => setReimport(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <ErrorMessage error={sources.error ?? removeError ?? reimportPreview.error ?? test.error} />
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
                <td>
                  {date(source.type === 'upload' ? source.lastImportedAt : source.lastReadAt)}
                </td>
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
                      <Link className="button secondary" to={`/admin/sources/${source.id}/cells`}>
                        {t('sources.grid.open')}
                      </Link>
                    )}
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
                    {source.type === 'upload' && (
                      <label className="button secondary file-button">
                        {t('sources.reimport.action')}
                        <input
                          type="file"
                          accept={`.xlsx,${EXCEL_MIME}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) reimportPreview.mutate({ source, file });
                          }}
                        />
                      </label>
                    )}
                    {source.type !== 'upload' && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={test.isPending}
                        onClick={() => test.mutate(source)}
                      >
                        {t('sources.test')}
                      </button>
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
