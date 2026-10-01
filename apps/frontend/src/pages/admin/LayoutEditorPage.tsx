import {
  BLOCK_TYPES,
  type AdminLayoutPart,
  type AssembledRow,
  LAYOUT_FORBIDDEN_BLOCK_TYPES,
  type LayoutKind,
  type Row,
  type Warning,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { getLayoutPart, previewLayout, publishLayout, saveLayoutDraft } from '../../api/pages';
import { Warnings } from '../../builder/FormEditor';
import { RowsEditor } from '../../builder/RowsEditor';
import { PreviewGroupSelect } from '../../builder/PreviewGroupSelect';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { Rows } from '../../render/Rows';

const LAYOUT_TYPES = BLOCK_TYPES.filter((type) => !LAYOUT_FORBIDDEN_BLOCK_TYPES.includes(type));

/** Header ou footer partagé : même cycle brouillon → publication que les pages. */
export function LayoutEditorPage() {
  const { kind = 'header' } = useParams() as { kind: LayoutKind };
  const part = useQuery({
    queryKey: ['admin', 'layout', kind],
    queryFn: () => getLayoutPart(kind),
  });
  if (part.error) return <ErrorMessage error={part.error} />;
  if (!part.data) return <Loading />;
  return <Editor key={kind} initial={part.data} />;
}

function Editor({ initial }: { initial: AdminLayoutPart }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const kind = initial.kind;
  const [saved, setSaved] = useState(initial);
  const [rows, setRows] = useState<Row[]>(initial.draft.rows);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<AssembledRow[] | null>(null);
  const toast = useToast();
  const [previewGroup, setPreviewGroup] = useState('');
  const [warnings, setWarnings] = useState<Warning[]>([]);

  const onSaved = (part: AdminLayoutPart) => {
    setSaved(part);
    setRows(part.draft.rows);
    setDirty(false);
    queryClient.setQueryData(['admin', 'layout', kind], part);
  };
  const save = async () => {
    const { warnings: found, ...part } = await saveLayoutDraft(kind, {
      config: { rows },
      version: saved.version,
    });
    setWarnings(found);
    onSaved(part);
  };
  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => toast(t('builder.saved')),
  });
  const previewMutation = useMutation({
    mutationFn: async (asGroup: string) => {
      if (dirty) await save();
      return previewLayout(kind, asGroup || undefined);
    },
    onSuccess: setPreview,
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (dirty) await save();
      return publishLayout(kind);
    },
    onSuccess: (part) => {
      onSaved(part);
      void queryClient.invalidateQueries({ queryKey: ['layout'] });
      toast(t('builder.published'));
    },
  });
  const error = saveMutation.error ?? previewMutation.error ?? publishMutation.error;
  const busy = saveMutation.isPending || previewMutation.isPending || publishMutation.isPending;

  return (
    <section className="page-editor">
      <div className="editor-header">
        <h1>{t(`builder.zoneNames.${kind}`)}</h1>
        <p className="muted">
          {t(`builder.layoutIntro.${kind}`)}
          {saved.publishedAt &&
            ` ${t('builder.lastPublished', {
              date: new Date(saved.publishedAt).toLocaleString('fr-FR'),
            })}`}
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
          <div className="preview-frame themed">
            <Rows rows={preview} />
          </div>
        </div>
      )}
      <RowsEditor
        rows={rows}
        allowedTypes={LAYOUT_TYPES}
        onChange={(next) => {
          setRows(next);
          setDirty(true);
        }}
      />
    </section>
  );
}
