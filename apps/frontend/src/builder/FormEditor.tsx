import {
  type AdminForm,
  AUTO_FIELDS,
  type Block,
  FIELD_TYPES,
  type FieldType,
  type FormDefinition,
  type FormField,
  FormMode,
  type Warning,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import {
  createForm,
  getAdminForm,
  saveFormDraft,
  setFormOpen,
  setFormSettings,
} from '../api/forms';
import { instantiateTemplate, listTemplates } from '../api/templates';
import { ErrorMessage } from '../components/ErrorMessage';
import { SaveAsTemplate } from '../components/SaveAsTemplate';
import { useSources } from './DataBlockEditors';
import { usePageEditor } from './PageEditorContext';

type FormBlock = Extract<Block, { type: 'form' }>;

/** Avertissements non bloquants (cellule-formule, zone non couverte, invalidations). */
export function Warnings({ warnings }: { warnings: Warning[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <div className="notice warning" role="status">
      {warnings.map((w, i) => (
        <p key={i}>
          {t(`warnings.${w.code}`)}
          {Array.isArray(w.cells) && ` ${(w.cells as string[]).join(', ')}`}
          {Array.isArray(w.items) &&
            ` ${(w.items as { form: string; page: string }[])
              .map((item) => t('builder.form.zoneItem', item))
              .join(' ; ')}`}
        </p>
      ))}
    </div>
  );
}

/** Module Formulaire : le formulaire est créé à l'ajout du bloc, puis configuré. */
export function FormEditor({
  block,
  onChange,
}: {
  block: FormBlock;
  onChange: (block: FormBlock) => void;
}) {
  const page = usePageEditor();
  if (!block.config.formId) {
    return (
      <NewForm
        pageId={page?.pageId}
        blockId={block.id}
        onCreated={(formId) => onChange({ ...block, config: { formId } })}
      />
    );
  }
  return <FormLoader formId={block.config.formId} />;
}

function NewForm({
  pageId,
  blockId,
  onCreated,
}: {
  pageId: string | undefined;
  blockId: string;
  onCreated: (formId: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FormMode>(FormMode.modification);
  const [templateId, setTemplateId] = useState('');
  const templates = useQuery({
    queryKey: ['admin', 'templates', 'form'],
    queryFn: () => listTemplates('form'),
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!templateId)
        return (await createForm({ pageId: pageId!, pageBlockId: blockId, mode })).id;
      // Modèle : champs repris, mappings à redéfinir (10).
      const result = await instantiateTemplate(templateId, { pageId, pageBlockId: blockId });
      return result.type === 'form' ? result.formId : '';
    },
    onSuccess: (formId) => onCreated(formId),
  });
  return (
    <div className="form">
      {(templates.data?.length ?? 0) > 0 && (
        <label>
          {t('builder.form.fromTemplate')}
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{t('builder.form.blank')}</option>
            {templates.data?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({t(`builder.form.modes.${template.details.mode}`)})
              </option>
            ))}
          </select>
          {templateId && <small>{t('builder.form.templateHint')}</small>}
        </label>
      )}
      {!templateId && (
        <label>
          {t('builder.form.mode')}
          <select value={mode} onChange={(e) => setMode(e.target.value as FormMode)}>
            {Object.values(FormMode).map((m) => (
              <option key={m} value={m}>
                {t(`builder.form.modes.${m}`)}
              </option>
            ))}
          </select>
          <small>{t(`builder.form.modeHints.${mode}`)}</small>
        </label>
      )}
      <ErrorMessage error={create.error} />
      <button type="button" disabled={!pageId || create.isPending} onClick={() => create.mutate()}>
        {t('builder.form.create')}
      </button>
    </div>
  );
}

function FormLoader({ formId }: { formId: string }) {
  const { t } = useTranslation();
  const form = useQuery({
    queryKey: ['admin', 'form', formId],
    queryFn: () => getAdminForm(formId),
  });
  if (form.error) return <ErrorMessage error={form.error} />;
  if (!form.data) return <p>{t('common.loading')}</p>;
  return <DefinitionEditor key={form.data.id} initial={form.data} />;
}

const newField = (n: number): FormField => ({
  key: `champ_${n}`,
  label: '',
  help: '',
  type: 'text',
  required: false,
});

/** Nombre facultatif d'un champ de saisie : vide → `undefined`. */
const optionalNumber = (value: string) => (value === '' ? undefined : Number(value));

function DefinitionEditor({ initial }: { initial: AdminForm }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const page = usePageEditor();
  const sources = useSources();
  const [form, setForm] = useState(initial);
  const [def, setDef] = useState<FormDefinition>(initial.draft);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<{ warnings: Warning[]; wouldInvalidate: number } | null>(
    null,
  );
  const mode = form.mode;
  const source = sources.data?.find((s) => s.id === def.sourceId);
  const linkable = (page?.blocks ?? []).filter(
    (b) =>
      (b.type === 'table' || b.type === 'catalog') &&
      b.config.sourceId === def.sourceId &&
      b.config.sheet === def.sheet,
  );

  const edit = (patch: Partial<FormDefinition>) => {
    setDef({ ...def, ...patch });
    setDirty(true);
  };
  const setField = (i: number, patch: Partial<FormField>) =>
    edit({ fields: def.fields.map((f, j) => (i === j ? { ...f, ...patch } : f)) });
  const onForm = (next: AdminForm) => {
    setForm(next);
    queryClient.setQueryData(['admin', 'form', next.id], next);
  };

  const save = useMutation({
    mutationFn: () => saveFormDraft(form.id, { definition: def, version: form.version }),
    onSuccess: (res) => {
      onForm(res.form);
      setDef(res.form.draft);
      setDirty(false);
      setResult({ warnings: res.warnings, wouldInvalidate: res.wouldInvalidate });
    },
  });
  const [settingsWarnings, setSettingsWarnings] = useState<Warning[]>([]);
  const settings = useMutation({
    mutationFn: (body: Parameters<typeof setFormSettings>[1]) => setFormSettings(form.id, body),
    onSuccess: (next) => {
      onForm(next);
      setSettingsWarnings([]);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'CONFIRMATION_REQUIRED') {
        setSettingsWarnings((error.error.details.warnings ?? []) as Warning[]);
      }
    },
  });
  const openClose = useMutation({
    mutationFn: (open: boolean) => setFormOpen(form.id, open),
    onSuccess: onForm,
  });
  const settingsError =
    settings.error instanceof ApiRequestError && settings.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : settings.error;

  return (
    <div className="form form-editor">
      <p className="muted">
        {t(`builder.form.modes.${mode}`)} ·{' '}
        {form.configured ? t('builder.form.configured') : t('builder.form.notConfigured')}
        {form.publishedVersion === null && ` · ${t('builder.form.neverPublished')}`}
      </p>
      <SaveAsTemplate type="form" sourceId={form.id} defaultName={def.title} />

      <fieldset>
        <legend>{t('builder.form.texts')}</legend>
        <label>
          {t('builder.form.title')}
          <input
            value={def.title}
            maxLength={200}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </label>
        <label>
          {t('builder.form.intro')}
          <textarea rows={2} value={def.intro} onChange={(e) => edit({ intro: e.target.value })} />
        </label>
        <label>
          {t('builder.form.successMessage')}
          <input
            value={def.successMessage}
            onChange={(e) => edit({ successMessage: e.target.value })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('builder.data.source')}</legend>
        <label>
          {t('builder.data.sourceFile')}
          <select
            value={def.sourceId ?? ''}
            onChange={(e) => {
              const next = sources.data?.find((s) => s.id === e.target.value);
              edit({ sourceId: e.target.value || null, sheet: next?.sheets[0] ?? null });
            }}
          >
            <option value="">{t('builder.data.chooseSource')}</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('builder.data.sheet')}
          <select value={def.sheet ?? ''} onChange={(e) => edit({ sheet: e.target.value || null })}>
            {source?.sheets.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </label>
        {mode === 'ligne' && (
          <>
            <label>
              {t('builder.form.linkedBlock')}
              <select
                value={def.linkedBlockId ?? ''}
                onChange={(e) => edit({ linkedBlockId: e.target.value || undefined })}
              >
                <option value="">{t('builder.form.chooseLinkedBlock')}</option>
                {linkable.map((b, i) => (
                  <option key={b.id} value={b.id}>
                    {t(`builder.blockTypes.${b.type}`)} {i + 1}
                  </option>
                ))}
              </select>
              <small>{t('builder.form.linkedBlockHint')}</small>
            </label>
            <div className="inline-fields">
              <label>
                {t('builder.form.keyCol')}
                <input
                  value={def.keyCol ?? ''}
                  placeholder="A"
                  onChange={(e) => edit({ keyCol: e.target.value.toUpperCase() || undefined })}
                />
              </label>
              <label>
                {t('builder.form.rowStart')}
                <input
                  type="number"
                  min={1}
                  value={def.rowStart ?? ''}
                  onChange={(e) => edit({ rowStart: optionalNumber(e.target.value) })}
                />
              </label>
              <label>
                {t('builder.form.rowEnd')}
                <input
                  type="number"
                  min={1}
                  value={def.rowEnd ?? ''}
                  onChange={(e) => edit({ rowEnd: optionalNumber(e.target.value) ?? null })}
                />
              </label>
            </div>
          </>
        )}
        {mode === 'ajout' && (
          <div className="inline-fields">
            <label>
              {t('builder.form.startRow')}
              <input
                type="number"
                min={1}
                value={def.startRow ?? ''}
                onChange={(e) => edit({ startRow: optionalNumber(e.target.value) })}
              />
            </label>
            <label>
              {t('builder.form.maxNewRows')}
              <input
                type="number"
                min={1}
                value={def.maxNewRows ?? ''}
                onChange={(e) => edit({ maxNewRows: optionalNumber(e.target.value) })}
              />
            </label>
          </div>
        )}
      </fieldset>

      {def.fields.map((field, i) => (
        <FieldEditor
          key={i}
          index={i}
          mode={mode}
          field={field}
          onChange={(patch) => setField(i, patch)}
          onMove={
            i > 0
              ? () => {
                  const fields = [...def.fields];
                  [fields[i - 1], fields[i]] = [fields[i]!, fields[i - 1]!];
                  edit({ fields });
                }
              : undefined
          }
          onRemove={() => edit({ fields: def.fields.filter((_, j) => j !== i) })}
        />
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => edit({ fields: [...def.fields, newField(def.fields.length + 1)] })}
      >
        {t('builder.form.addField')}
      </button>

      <ErrorMessage error={save.error} />
      {result && !dirty && (
        <>
          <Warnings warnings={result.warnings} />
          <p className="notice" role="status">
            {t('builder.form.saved')}{' '}
            {result.wouldInvalidate > 0 &&
              t('builder.form.wouldInvalidate', { count: result.wouldInvalidate })}
          </p>
        </>
      )}
      <button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {t('builder.form.save')}
      </button>

      <fieldset>
        <legend>{t('builder.form.operational')}</legend>
        <small>{t('builder.form.operationalHint')}</small>
        <p>
          {form.isOpen ? t('builder.form.isOpen') : t('builder.form.isClosed')}{' '}
          <button
            type="button"
            className="secondary"
            disabled={openClose.isPending}
            onClick={() => openClose.mutate(!form.isOpen)}
          >
            {form.isOpen ? t('builder.form.close') : t('builder.form.open')}
          </button>
        </p>
        <label>
          {t('builder.form.closesAt')}
          <input
            type="datetime-local"
            defaultValue={form.closesAt ? form.closesAt.slice(0, 16) : ''}
            onBlur={(e) =>
              settings.mutate({
                closesAt: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </label>
        <label className="inline">
          <input
            type="checkbox"
            checked={form.autoValidate}
            onChange={(e) => settings.mutate({ autoValidate: e.target.checked })}
          />
          {t('builder.form.autoValidate')}
        </label>
        {settingsWarnings.length > 0 && (
          <>
            <Warnings warnings={settingsWarnings} />
            <button
              type="button"
              onClick={() => settings.mutate({ autoValidate: true, confirm: true })}
            >
              {t('common.confirm')}
            </button>
          </>
        )}
        <ErrorMessage error={settingsError ?? openClose.error} />
      </fieldset>
    </div>
  );
}

function FieldEditor({
  index,
  mode,
  field,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  mode: FormMode;
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onMove?: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const sources = useSources();
  const options = field.options;
  const optionsSource = sources.data?.find((s) => s.id === options?.sourceId);
  return (
    <fieldset className="field-editor">
      <legend>{t('builder.form.field', { n: index + 1 })}</legend>
      <div className="inline-fields">
        <label>
          {t('builder.form.label')}
          <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
        </label>
        <label>
          {t('builder.form.key')}
          <input
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value.toLowerCase() })}
          />
        </label>
        {mode === 'modification' ? (
          <label>
            {t('builder.form.cell')}
            <input
              value={field.cell ?? ''}
              placeholder="B2"
              onChange={(e) => onChange({ cell: e.target.value.toUpperCase() || undefined })}
            />
          </label>
        ) : (
          <label>
            {t('builder.form.col')}
            <input
              value={field.col ?? ''}
              placeholder="C"
              onChange={(e) => onChange({ col: e.target.value.toUpperCase() || undefined })}
            />
          </label>
        )}
      </div>
      <label>
        {t('builder.form.help')}
        <input value={field.help} onChange={(e) => onChange({ help: e.target.value })} />
      </label>
      <div className="inline-fields">
        <label>
          {t('builder.form.type')}
          <select
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as FieldType;
              onChange({
                type,
                movement: undefined,
                options: type === 'select' ? { kind: 'list', values: [] } : undefined,
                auto: undefined,
              });
            }}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`builder.form.types.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('builder.form.auto')}
          <select
            value={field.auto ?? ''}
            onChange={(e) =>
              onChange({
                auto: (e.target.value || undefined) as FormField['auto'],
                type: e.target.value === 'date' ? 'date' : e.target.value ? 'text' : field.type,
              })
            }
          >
            <option value="">{t('builder.form.autoNone')}</option>
            {AUTO_FIELDS.map((auto) => (
              <option key={auto} value={auto}>
                {t(`builder.form.autos.${auto}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!field.auto && (
        <div className="checks">
          <label className="inline">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            {t('builder.form.required')}
          </label>
          {field.type === 'number' && mode !== 'ajout' && (
            <label className="inline">
              <input
                type="checkbox"
                checked={!!field.movement}
                onChange={(e) => onChange({ movement: e.target.checked || undefined })}
              />
              {t('builder.form.movement')}
            </label>
          )}
        </div>
      )}
      {(field.type === 'text' || field.type === 'textarea') && !field.auto && (
        <label>
          {t('builder.form.maxLength')}
          <input
            type="number"
            min={1}
            value={field.maxLength ?? ''}
            onChange={(e) => onChange({ maxLength: optionalNumber(e.target.value) })}
          />
        </label>
      )}
      {field.type === 'number' && (
        <div className="inline-fields">
          <label>
            {t('builder.form.min')}
            <input
              type="number"
              value={field.min ?? ''}
              onChange={(e) => onChange({ min: optionalNumber(e.target.value) })}
            />
          </label>
          <label>
            {t('builder.form.max')}
            <input
              type="number"
              value={field.max ?? ''}
              onChange={(e) => onChange({ max: optionalNumber(e.target.value) })}
            />
          </label>
        </div>
      )}
      {field.type === 'date' && !field.auto && (
        <div className="inline-fields">
          <label>
            {t('builder.form.min')}
            <input
              type="date"
              value={field.minDate ?? ''}
              onChange={(e) => onChange({ minDate: e.target.value || undefined })}
            />
          </label>
          <label>
            {t('builder.form.max')}
            <input
              type="date"
              value={field.maxDate ?? ''}
              onChange={(e) => onChange({ maxDate: e.target.value || undefined })}
            />
          </label>
        </div>
      )}
      {field.type === 'select' && options && (
        <>
          <label>
            {t('builder.form.optionsKind')}
            <select
              value={options.kind}
              onChange={(e) =>
                onChange({
                  options:
                    e.target.value === 'list'
                      ? { kind: 'list', values: [] }
                      : { kind: 'range', sourceId: '', sheet: '', range: 'A1:A10' },
                })
              }
            >
              <option value="list">{t('builder.form.optionsList')}</option>
              <option value="range">{t('builder.form.optionsRange')}</option>
            </select>
          </label>
          {options.kind === 'list' ? (
            <label>
              {t('builder.form.optionsValues')}
              <textarea
                rows={3}
                value={(options.values ?? []).join('\n')}
                onChange={(e) =>
                  onChange({
                    options: {
                      kind: 'list',
                      values: e.target.value
                        .split('\n')
                        .map((v) => v.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </label>
          ) : (
            <div className="inline-fields">
              <label>
                {t('builder.data.sourceFile')}
                <select
                  value={options.sourceId ?? ''}
                  onChange={(e) => {
                    const next = sources.data?.find((s) => s.id === e.target.value);
                    onChange({
                      options: {
                        ...options,
                        sourceId: e.target.value,
                        sheet: next?.sheets[0] ?? '',
                      },
                    });
                  }}
                >
                  <option value="">{t('builder.data.chooseSource')}</option>
                  {sources.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('builder.data.sheet')}
                <select
                  value={options.sheet ?? ''}
                  onChange={(e) => onChange({ options: { ...options, sheet: e.target.value } })}
                >
                  {optionsSource?.sheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('builder.data.rangeRef')}
                <input
                  value={options.range ?? ''}
                  placeholder="A2:A20"
                  onChange={(e) =>
                    onChange({ options: { ...options, range: e.target.value.toUpperCase() } })
                  }
                />
              </label>
            </div>
          )}
        </>
      )}
      <div className="actions">
        {onMove && (
          <button type="button" className="secondary" onClick={onMove}>
            {t('builder.moveUp')}
          </button>
        )}
        <button type="button" className="danger" onClick={onRemove}>
          {t('builder.form.removeField')}
        </button>
      </div>
    </fieldset>
  );
}
