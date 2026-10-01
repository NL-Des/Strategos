import type {
  AssembledFormBlock,
  RowFormLink,
  Submission,
  SubmissionValue,
  SubmissionValues,
  UserFormField,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { getPrefill, getUserForm, submitForm } from '../api/forms';
import { ErrorMessage } from '../components/ErrorMessage';
import { Notice } from '../components/Notice';
import { formatDateTime } from '../format';
import { Loading } from '../components/Loading';

/** Saisie d'un champ : texte brut pour les champs de saisie, booléen pour une case. */
type Input = string | boolean;

function toInput(value: SubmissionValue | undefined): Input {
  if (typeof value === 'boolean') return value;
  return value === null || value === undefined ? '' : String(value);
}

function toValue(field: UserFormField, input: Input | undefined): SubmissionValue {
  if (field.type === 'checkbox') return input === true;
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') return null;
  if (field.type === 'number') return Number(text.replace(',', '.'));
  return text;
}

function FieldInput({
  id,
  field,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  field: UserFormField;
  value: Input | undefined;
  onChange: (value: Input) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const common = {
    id,
    disabled,
    required: field.required && field.type !== 'checkbox',
    'aria-invalid': invalid || undefined,
  };
  if (field.readOnly) return <input {...common} readOnly value={field.value ?? ''} />;
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          {...common}
          rows={4}
          maxLength={field.maxLength}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          {...common}
          type="number"
          step="any"
          min={field.min}
          max={field.max}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'date':
      return (
        <input
          {...common}
          type="date"
          min={field.minDate}
          max={field.maxDate}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'checkbox':
      return (
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('forms.choose')}</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    default:
      return (
        <input
          {...common}
          maxLength={field.maxLength}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/**
 * Un formulaire (09) : champs automatiques en lecture seule, champs
 * « mouvement » en quantité signée. Fermé ou complet, il reste affiché sans
 * pouvoir être envoyé. `rowKey` : formulaire de ligne, pré-rempli.
 */
export function FormView({
  formUrl,
  submitUrl,
  rowKey,
  onCancel,
}: {
  formUrl: string;
  submitUrl: string | null;
  rowKey?: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useQuery({ queryKey: ['form', formUrl], queryFn: () => getUserForm(formUrl) });
  const prefill = useQuery({
    queryKey: ['form', formUrl, 'prefill', rowKey],
    queryFn: () => getPrefill(formUrl, rowKey!),
    enabled: rowKey !== undefined,
  });
  const [inputs, setInputs] = useState<Record<string, Input>>({});
  const [done, setDone] = useState<Submission | null>(null);
  // Plusieurs formulaires d'une même page peuvent partager une clé de champ.
  const uid = useId();
  const fieldId = (key: string) => `${uid}-${key}`;
  const submit = useMutation({
    mutationFn: (values: SubmissionValues) => submitForm(submitUrl!, { values, rowKey }),
    onSuccess: (submission) => {
      setDone(submission);
      setInputs({});
      void queryClient.invalidateQueries({ queryKey: ['form', formUrl] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'submissions'] });
    },
  });

  // Validation refusée : le focus va au premier champ en erreur.
  const fieldErrors =
    submit.error instanceof ApiRequestError && submit.error.code === 'VALIDATION_FAILED'
      ? ((submit.error.error.details.fields ?? {}) as Record<string, string[]>)
      : {};
  const firstInvalid = form.data?.fields.find((f) => `values.${f.key}` in fieldErrors)?.key;
  useEffect(() => {
    if (firstInvalid) document.getElementById(`${uid}-${firstInvalid}`)?.focus();
  }, [firstInvalid, uid, submit.submittedAt]);

  if (form.error) return <ErrorMessage error={form.error} />;
  if (prefill.error) return <ErrorMessage error={prefill.error} />;
  if (!form.data || (rowKey !== undefined && !prefill.data)) return <Loading />;
  const { fields, state, title, intro, successMessage, closesAt } = form.data;
  const initial = prefill.data?.values ?? {};
  const valueOf = (key: string) => (key in inputs ? inputs[key] : toInput(initial[key]));

  const closed = state !== 'open';
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const values: SubmissionValues = {};
    for (const field of fields)
      if (!field.auto) values[field.key] = toValue(field, valueOf(field.key));
    submit.mutate(values);
  };

  return (
    <form className="block-form" onSubmit={onSubmit}>
      {title && <h3>{title}</h3>}
      {intro && <p className="form-intro">{intro}</p>}
      {closed && (
        <Notice tone="warning" role="status">
          {t(`forms.state.${state}`)}
        </Notice>
      )}
      {!closed && closesAt && (
        <p className="muted">{t('forms.closesAt', { date: formatDateTime(closesAt) })}</p>
      )}
      {done ? (
        <Notice tone="success" role="status">
          <p>{successMessage || t('forms.sent')}</p>
          <p>
            {t(`submissions.status.${done.status}`)} ·{' '}
            <Link to="/submissions">{t('account.submissions')}</Link>
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => (rowKey !== undefined && onCancel ? onCancel() : setDone(null))}
          >
            {rowKey !== undefined && onCancel ? t('common.close') : t('forms.again')}
          </button>
        </Notice>
      ) : (
        <>
          {fields.map((field) => {
            const errors = fieldErrors[`values.${field.key}`];
            return (
              <div
                key={field.key}
                className={field.type === 'checkbox' ? 'form-field inline' : 'form-field'}
              >
                <label htmlFor={fieldId(field.key)}>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </label>
                <FieldInput
                  id={fieldId(field.key)}
                  disabled={closed}
                  field={field}
                  value={valueOf(field.key)}
                  onChange={(value) => setInputs({ ...inputs, [field.key]: value })}
                  invalid={!!errors}
                />
                {field.movement && <small>{t('forms.movementHint')}</small>}
                {field.help && <small>{field.help}</small>}
                {errors && (
                  <small className="field-error">
                    {[...new Set(errors)]
                      .map((c) => t(`validation.${c}`, { defaultValue: t('validation.invalid') }))
                      .join(', ')}
                  </small>
                )}
              </div>
            );
          })}
          {Object.keys(fieldErrors).length === 0 && <ErrorMessage error={submit.error} />}
          <div className="actions">
            {submitUrl ? (
              <button type="submit" disabled={closed || submit.isPending}>
                {t('forms.submit')}
              </button>
            ) : (
              <p className="muted">{t('forms.previewOnly')}</p>
            )}
            {onCancel && (
              <button type="button" className="secondary" onClick={onCancel}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

/** Module Formulaire (06). */
export function FormBlock({ block }: { block: AssembledFormBlock }) {
  return <FormView formUrl={block.config.formUrl} submitUrl={block.config.submitUrl} />;
}

/** Liens « Proposer une modification » d'une ligne ; `open` : le formulaire déjà ouvert. */
export function RowFormLinks({
  forms,
  rowKeys,
  open,
  onToggle,
}: {
  forms: RowFormLink[];
  rowKeys: Record<string, string> | undefined;
  open: RowFormLink | null;
  onToggle: (form: RowFormLink | null) => void;
}) {
  const { t } = useTranslation();
  if (forms.length === 0 || !rowKeys) return null;
  return (
    <div className="row-forms">
      {forms.map((form) =>
        rowKeys[form.formId] ? (
          <button
            key={form.formId}
            type="button"
            className="link"
            aria-expanded={open?.formId === form.formId}
            onClick={() => onToggle(open?.formId === form.formId ? null : form)}
          >
            {forms.length > 1 ? form.title : t('forms.proposeChange')}
          </button>
        ) : null,
      )}
    </div>
  );
}

/** Formulaire de ligne ouvert, pré-rempli avec la ligne `rowKey`. */
export function RowFormPanel({
  form,
  rowKey,
  onClose,
}: {
  form: RowFormLink;
  rowKey: string | undefined;
  onClose: () => void;
}) {
  return (
    <div className="row-form-panel">
      <FormView
        key={form.formId}
        formUrl={form.formUrl}
        submitUrl={form.submitUrl}
        rowKey={rowKey}
        onCancel={onClose}
      />
    </div>
  );
}

/**
 * « Proposer une modification » sur une carte de Catalogue : ouvre le
 * formulaire de ligne relié, pré-rempli, sous les liens.
 */
export function RowFormButtons({
  forms,
  rowKeys,
}: {
  forms: RowFormLink[];
  rowKeys: Record<string, string> | undefined;
}) {
  const [open, setOpen] = useState<RowFormLink | null>(null);
  if (forms.length === 0 || !rowKeys) return null;
  return (
    <>
      <RowFormLinks forms={forms} rowKeys={rowKeys} open={open} onToggle={setOpen} />
      {open && (
        <RowFormPanel form={open} rowKey={rowKeys[open.formId]} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
