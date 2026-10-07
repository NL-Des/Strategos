import type {
  AdminPage,
  AssembledLayout,
  AssembledPage,
  PageConfig,
  Row,
  Warning,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
import { getPublishPreview } from '../../api/forms';
import { listThemes } from '../../api/themes';
import { Warnings } from '../../builder/FormEditor';
import { blocksOf, PageEditorContext } from '../../builder/PageEditorContext';
import { RowsEditor } from '../../builder/RowsEditor';
import { PreviewGroupSelect } from '../../builder/PreviewGroupSelect';
import { useConfirm, useConfirmed } from '../../components/Dialog';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../format';
import { SaveAsTemplate } from '../../components/SaveAsTemplate';
import { PageRender } from '../../render/PageRender';
import { Breadcrumb } from '../../components/Breadcrumb';
import { ActionMenu } from '../../components/ActionMenu';
import { useUnsavedGuard } from '../../useUnsavedGuard';

/** Éditeur d'une page : on modifie toujours le brouillon, publié par un bouton dédié. */
const SIDEBAR_MODES = ['none', 'shared', 'own'] as const;
type SidebarMode = (typeof SIDEBAR_MODES)[number];

export function PageEditorPage() {
  const { id = '' } = useParams();
  const page = useQuery({ queryKey: ['admin', 'page', id], queryFn: () => getAdminPage(id) });
  if (page.error) return <ErrorMessage error={page.error} />;
  if (!page.data) return <Loading />;
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
  const toast = useToast();
  const confirm = useConfirm();
  const confirmed = useConfirmed();
  const [previewGroup, setPreviewGroup] = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const themes = useQuery({ queryKey: ['admin', 'themes'], queryFn: listThemes });
  useUnsavedGuard(dirty);
  const context = useMemo(
    () => ({ pageId: saved.id, blocks: blocksOf([draft.zones.main, draft.zones.sidebar]) }),
    [saved.id, draft],
  );

  const edit = (patch: Partial<PageConfig>) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const setZone = (zone: 'main' | 'sidebar', rows: Row[] | null) =>
    edit({ zones: { ...draft.zones, [zone]: rows } });
  /** Retirer une zone qui contient des rangées les supprime : on le confirme. */
  const toggleZone = (zone: 'main' | 'sidebar', shown: boolean) => {
    if (shown) return setZone(zone, []);
    if (!draft.zones[zone]?.length) return setZone(zone, null);
    confirmed(
      {
        title: t('builder.removeZoneConfirm', { zone: t(`builder.zoneNames.${zone}`) }),
        confirmLabel: t('common.delete'),
        danger: true,
      },
      () => setZone(zone, null),
    );
  };

  /** Sidebar de la page : aucune, la commune, ou la sienne (06 — Structure d'une page). */
  const sidebarMode: SidebarMode = draft.showSidebar
    ? 'shared'
    : draft.zones.sidebar !== null
      ? 'own'
      : 'none';
  const setSidebarMode = (mode: SidebarMode) => {
    const apply = () =>
      edit({
        showSidebar: mode === 'shared',
        zones: { ...draft.zones, sidebar: mode === 'own' ? (draft.zones.sidebar ?? []) : null },
      });
    if (mode === 'own' || !draft.zones.sidebar?.length) return apply();
    confirmed(
      {
        title: t('builder.removeZoneConfirm', { zone: t('builder.zoneNames.sidebar') }),
        confirmLabel: t('common.delete'),
        danger: true,
      },
      apply,
    );
  };

  const onSaved = (page: AdminPage) => {
    setSaved(page);
    setDraft(page.draft);
    setDirty(false);
    queryClient.setQueryData(['admin', 'page', page.id], page);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });
  };
  const save = async () => {
    const { warnings: found, ...page } = await savePageDraft(saved.id, {
      name,
      config: draft,
      version: saved.version,
    });
    onSaved(page);
    setWarnings(found);
    return page;
  };

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => toast(t('builder.saved')),
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
      // Les soumissions en attente que la publication invaliderait sont annoncées avant.
      const { invalidatedSubmissions: count } = await getPublishPreview(saved.id);
      if (
        count > 0 &&
        !(await confirm({
          title: t('builder.publishInvalidates', { count }),
          confirmLabel: t('builder.publish'),
        }))
      )
        return null;
      return publishPage(saved.id, count > 0);
    },
    onSuccess: (page) => {
      if (!page) return;
      onSaved(page);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'submissions'] });
      void queryClient.invalidateQueries({ queryKey: ['page', page.id] });
      toast(t('builder.published'));
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
      <Breadcrumb items={[{ label: t('admin.nav.pages'), to: '/admin/pages' }]} />
      <div className="editor-header">
        <h1>{name || t('builder.pages.untitled')}</h1>
        <p className="muted editor-state">
          {saved.publishedAt
            ? t('builder.lastPublished', {
                date: formatDateTime(saved.publishedAt),
              })
            : t('builder.pages.neverPublished')}
          {dirty && <span className="status status-pending">{t('builder.unsaved')}</span>}
        </p>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => publishMutation.mutate()}>
            {t('builder.publish')}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !dirty}
            onClick={() => saveMutation.mutate()}
          >
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
          <Link className="button secondary" to={`/admin/rights/page/${saved.id}`}>
            {t('rights.pageAccess')}
          </Link>
          <SaveAsTemplate type="page" sourceId={saved.id} defaultName={saved.name} />
          <ActionMenu label={t('builder.moreActions')} icon="more">
            <button
              type="button"
              className="menu-item danger"
              role="menuitem"
              onClick={() =>
                confirmed(
                  {
                    title: t('builder.pages.deleteConfirm', { name: saved.name }),
                    confirmLabel: t('common.delete'),
                    danger: true,
                  },
                  () => deleteMutation.mutate(),
                )
              }
            >
              {t('builder.pages.delete')}
            </button>
          </ActionMenu>
        </div>
        <ErrorMessage error={error} />
        <Warnings warnings={warnings} />
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
              onChange={(e) => toggleZone('main', e.target.checked)}
            />
            {t('builder.zoneNames.main')}
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
        <label>
          {t('builder.zoneNames.sidebar')}
          <select
            value={sidebarMode}
            onChange={(e) => setSidebarMode(e.target.value as SidebarMode)}
          >
            {SIDEBAR_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`builder.sidebarModes.${mode}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <PageEditorContext.Provider value={context}>
        {(['main', 'sidebar'] as const).map(
          (zone) =>
            draft.zones[zone] && (
              <div key={zone} className="zone-editor">
                <h2>{t(`builder.zoneNames.${zone}`)}</h2>
                {zone === 'sidebar' && <p className="muted">{t('builder.sidebarHint')}</p>}
                <RowsEditor rows={draft.zones[zone]} onChange={(rows) => setZone(zone, rows)} />
              </div>
            ),
        )}
      </PageEditorContext.Provider>
    </section>
  );
}
