import type { AdminPage, AssembledLayout, AssembledPage, PageConfig, Row } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  deletePage,
  getAdminPage,
  previewPage,
  previewPageLayout,
  publishPage,
  savePageDraft,
} from '../../api/pages';
import { listThemes } from '../../api/settings';
import { RowsEditor } from '../../builder/RowsEditor';
import { PreviewGroupSelect } from '../../builder/PreviewGroupSelect';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageRender } from '../../render/PageRender';

/** Éditeur d'une page : on modifie toujours le brouillon, publié par un bouton dédié. */
export function PageEditorPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const page = useQuery({ queryKey: ['admin', 'page', id], queryFn: () => getAdminPage(id) });
  if (page.error) return <ErrorMessage error={page.error} />;
  if (!page.data) return <p>{t('common.loading')}</p>;
  return <Editor key={page.data.id} initial={page.data} />;
}

function Editor({ initial }: { initial: AdminPage }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [draft, setDraft] = useState<PageConfig>(initial.draft);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<{
    page: AssembledPage;
    layout: AssembledLayout;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewGroup, setPreviewGroup] = useState('');
  const themes = useQuery({ queryKey: ['admin', 'themes'], queryFn: listThemes });

  const edit = (patch: Partial<PageConfig>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
    setNotice(null);
  };
  const setZone = (zone: 'main' | 'sidebar', rows: Row[] | null) =>
    edit({ zones: { ...draft.zones, [zone]: rows } });

  const onSaved = (page: AdminPage) => {
    setSaved(page);
    setDraft(page.draft);
    setDirty(false);
    queryClient.setQueryData(['admin', 'page', page.id], page);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });
  };
  const save = async () => {
    const page = await savePageDraft(saved.id, { name, config: draft, version: saved.version });
    onSaved(page);
    return page;
  };

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => setNotice(t('builder.saved')),
  });
  const previewMutation = useMutation({
    mutationFn: async (asGroup: string) => {
      if (dirty) await save();
      const group = asGroup || undefined;
      const [page, layout] = await Promise.all([
        previewPage(saved.id, group),
        previewPageLayout(group),
      ]);
      return { page, layout };
    },
    onSuccess: setPreview,
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await save();
      return publishPage(saved.id);
    },
    onSuccess: (page) => {
      onSaved(page);
      void queryClient.invalidateQueries({ queryKey: ['page', page.id] });
      setNotice(t('builder.published'));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deletePage(saved.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });
      void navigate('/admin/pages', { replace: true });
    },
  });
  const error =
    saveMutation.error ?? previewMutation.error ?? publishMutation.error ?? deleteMutation.error;
  const busy = saveMutation.isPending || previewMutation.isPending || publishMutation.isPending;

  return (
    <section className="page-editor">
      <div className="editor-header">
        <h1>{name || t('builder.pages.untitled')}</h1>
        <p className="muted">
          {saved.publishedAt
            ? t('builder.lastPublished', {
                date: new Date(saved.publishedAt).toLocaleString('fr-FR'),
              })
            : t('builder.pages.neverPublished')}
          {dirty && ` · ${t('builder.unsaved')}`}
        </p>
        <div className="actions">
          <button type="button" disabled={busy || !dirty} onClick={() => saveMutation.mutate()}>
            {t('builder.saveDraft')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => previewMutation.mutate(previewGroup)}
          >
            {t('builder.preview')}
          </button>
          <button type="button" disabled={busy} onClick={() => publishMutation.mutate()}>
            {t('builder.publish')}
          </button>
          <Link className="button secondary" to={`/admin/rights/page/${saved.id}`}>
            {t('rights.pageAccess')}
          </Link>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (window.confirm(t('builder.pages.deleteConfirm', { name: saved.name })))
                deleteMutation.mutate();
            }}
          >
            {t('builder.pages.delete')}
          </button>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <ErrorMessage error={error} />
      </div>

      {preview && (
        <div className="preview">
          <div className="preview-bar">
            <strong>
              {t(previewGroup ? 'builder.previewTitleGroup' : 'builder.previewTitle')}
            </strong>
            <PreviewGroupSelect
              value={previewGroup}
              onChange={(groupId) => {
                setPreviewGroup(groupId);
                previewMutation.mutate(groupId);
              }}
            />
            <button type="button" className="secondary" onClick={() => setPreview(null)}>
              {t('builder.closePreview')}
            </button>
          </div>
          <div className="preview-frame">
            <PageRender page={preview.page} layout={preview.layout} />
          </div>
        </div>
      )}

      <div className="card form">
        <label>
          {t('builder.pages.name')}
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label>
          {t('builder.theme')}
          <select
            value={draft.themeId ?? ''}
            onChange={(e) => edit({ themeId: e.target.value || null })}
          >
            <option value="">{t('builder.defaultTheme')}</option>
            {themes.data?.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="checks">
          <legend>{t('builder.zones')}</legend>
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.showHeader}
              onChange={(e) => edit({ showHeader: e.target.checked })}
            />
            {t('builder.zoneNames.header')}
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.zones.main !== null}
              onChange={(e) => setZone('main', e.target.checked ? [] : null)}
            />
            {t('builder.zoneNames.main')}
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.zones.sidebar !== null}
              onChange={(e) => setZone('sidebar', e.target.checked ? [] : null)}
            />
            {t('builder.zoneNames.sidebar')}
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.showFooter}
              onChange={(e) => edit({ showFooter: e.target.checked })}
            />
            {t('builder.zoneNames.footer')}
          </label>
        </fieldset>
      </div>

      {(['main', 'sidebar'] as const).map(
        (zone) =>
          draft.zones[zone] && (
            <div key={zone} className="zone-editor">
              <h2>{t(`builder.zoneNames.${zone}`)}</h2>
              <RowsEditor rows={draft.zones[zone]} onChange={(rows) => setZone(zone, rows)} />
            </div>
          ),
      )}
    </section>
  );
}
