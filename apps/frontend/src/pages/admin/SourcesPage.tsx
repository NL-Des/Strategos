import {
  EXCEL_MAX_BYTES,
  EXCEL_MIME,
  formulaToFr,
  type ReimportMode,
  type ReimportPreview,
  type SourceSummary,
  sourceHasGrid,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { confirmReimport, previewReimport } from '../../api/forms';
import {
  deleteSource,
  getSourceScript,
  listSources,
  sourceDownloadUrl,
  testSource,
  uploadSource,
} from '../../api/sources';
import { Modal, useConfirm } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../format';
import {
  GoogleSheetLinkPanel,
  GoogleSheetScriptPanel,
  GoogleSheetsPanel,
  OneDrivePanel,
  ScriptBox,
} from './ConnectedSources';

interface Usages {
  pages: { id: string; name: string }[];
  layouts: string[];
}

const date = (iso: string | null) => (iso ? formatDateTime(iso) : '—');

/** Types de source à ajouter, du plus simple au plus complet ; valeur : clé du titre de la carte. */
const ADD_KINDS = {
  upload: 'sources.upload',
  gsheetLink: 'sources.gsheetLink.title',
  gsheetScript: 'sources.gsheetScript.title',
  gsheet: 'sources.gsheet.title',
  onedrive: 'sources.onedrive.title',
} as const;
type AddKind = keyof typeof ADD_KINDS;

/** Au retour de Google ou de Microsoft, la carte concernée s'ouvre pour montrer le résultat. */
function returnedFrom(): AddKind | null {
  const query = new URLSearchParams(window.location.search);
  return query.has('google') ? 'gsheet' : query.has('onedrive') ? 'onedrive' : null;
}

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
  const ask = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState<AddKind | null>(returnedFrom);
  const sources = useQuery({ queryKey: ['admin', 'sources'], queryFn: listSources });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });

  const upload = useMutation({
    mutationFn: uploadSource,
    onSuccess: () => {
      if (fileInput.current) fileInput.current.value = '';
      toast(t('sources.uploaded'));
      void refresh();
    },
  });

  /** Suppression : une seule fenêtre, qui liste les pages touchées s'il y en a. */
  const askDelete = async (source: SourceSummary, usages: Usages) => {
    const inUse = usages.pages.length + usages.layouts.length > 0;
    const ok = await ask({
      title: t('sources.deleteConfirm', { name: source.name }),
      message: inUse && (
        <>
          <p>{t('warnings.SOURCE_IN_USE', { name: source.name })}</p>
          <ul>
            {usages.pages.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {usages.layouts.map((kind) => (
              <li key={kind}>{t(`builder.zoneNames.${kind}`)}</li>
            ))}
          </ul>
        </>
      ),
      confirmLabel: inUse ? t('sources.deleteAnyway') : t('sources.delete'),
      danger: true,
    });
    if (ok) remove.mutate({ source, confirm: inUse });
  };
  const remove = useMutation({
    mutationFn: ({ source, confirm }: { source: SourceSummary; confirm: boolean }) =>
      deleteSource(source.id, confirm),
    onSuccess: () => void refresh(),
    // Un usage apparu depuis l'affichage de la liste : on redemande avec le détail du serveur.
    onError: (error, { source }) => {
      if (error instanceof ApiRequestError && error.code === 'CONFIRMATION_REQUIRED') {
        const [warning] = (error.error.details.warnings ?? []) as Partial<Usages>[];
        void askDelete(source, { pages: warning?.pages ?? [], layouts: warning?.layouts ?? [] });
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
  /** Script d'un Google Sheet relié par un script, à recoller dans le Sheet (mise à jour). */
  const script = useMutation({
    mutationFn: async (source: SourceSummary) => ({
      source,
      script: (await getSourceScript(source.id)).script,
    }),
  });
  const removeError =
    remove.error instanceof ApiRequestError && remove.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : remove.error;

  return (
    <section>
      <h1>{t('sources.title')}</h1>
      <p className="muted">{t('sources.intro')}</p>

      {script.data && (
        <Modal
          wide
          title={t('sources.gsheetScript.updateTitle', { name: script.data.source.name })}
          onClose={() => script.reset()}
        >
          <div className="form">
            <ol>
              {(t('sources.gsheetScript.updateSteps', { returnObjects: true }) as string[]).map(
                (step) => (
                  <li key={step}>{step}</li>
                ),
              )}
            </ol>
            <ScriptBox script={script.data.script} />
            <p className="notice">{t('sources.gsheetScript.warning')}</p>
            <div className="actions">
              <button type="button" className="secondary" onClick={() => script.reset()}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {reimport && (
        <Modal
          wide
          title={t('sources.reimport.title', { name: reimport.source.name })}
          onClose={() => setReimport(null)}
        >
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
          <div className="dialog-actions">
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
              className={reimport.preview.lostValidations.length > 0 ? 'danger solid' : undefined}
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
        </Modal>
      )}

      <ErrorMessage
        error={sources.error ?? removeError ?? reimportPreview.error ?? test.error ?? script.error}
      />
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
                <td>
                  {t(`sources.types.${source.type}`)}
                  {!source.writable && (
                    <>
                      <br />
                      <small>{t('sources.readOnly')}</small>
                    </>
                  )}
                  {source.scriptOutdated && (
                    <>
                      <br />
                      <span className="status status-rejected">
                        {t('sources.gsheetScript.outdated')}
                      </span>
                    </>
                  )}
                </td>
                <td>
                  <span
                    className={`status ${source.status === 'ok' ? 'status-validated' : 'status-rejected'}`}
                  >
                    {t(`sources.statuses.${source.status}`)}
                  </span>
                </td>
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
                    {sourceHasGrid(source.type) && (
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
                    {source.type === 'gsheet_script' && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={script.isPending}
                        onClick={() => script.mutate(source)}
                      >
                        {t('sources.gsheetScript.show')}
                      </button>
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
                      onClick={() => void askDelete(source, source.usages)}
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
      {sources.data?.length === 0 && <EmptyState icon="database">{t('sources.empty')}</EmptyState>}

      <h2 className="section-title">{t('sources.add')}</h2>
      <div className="actions source-kinds">
        {(Object.keys(ADD_KINDS) as AddKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            className={adding === kind ? undefined : 'secondary'}
            aria-expanded={adding === kind}
            onClick={() => setAdding(adding === kind ? null : kind)}
          >
            {t(ADD_KINDS[kind])}
          </button>
        ))}
      </div>
      {/* Les cartes restent montées : un script préparé ou un lien collé survit au changement de carte. */}
      <div hidden={adding !== 'upload'}>
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
      </div>
      <div hidden={adding !== 'gsheetLink'}>
        <GoogleSheetLinkPanel />
      </div>
      <div hidden={adding !== 'gsheetScript'}>
        <GoogleSheetScriptPanel />
      </div>
      <div hidden={adding !== 'gsheet'}>
        <GoogleSheetsPanel />
      </div>
      <div hidden={adding !== 'onedrive'}>
        <OneDrivePanel />
      </div>
    </section>
  );
}
