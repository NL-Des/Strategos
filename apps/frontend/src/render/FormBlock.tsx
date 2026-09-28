import type {
  AssembledFormBlock,
  RowFormLink,
  Submission,
  SubmissionValue,
  SubmissionValues,
  UserFormField,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { getPrefill, getUserForm, submitForm } from '../api/forms';
import { ErrorMessage } from '../components/ErrorMessage';

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
  field,
  value,
  onChange,
  invalid,
}: {
  field: UserFormField;
  value: Input | undefined;
  onChange: (value: Input) => void;
  invalid: boolean;
}) {
  const common = {
    id: `field-${field.key}`,
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
          <option value="" />
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
  const submit = useMutation({
    mutationFn: (values: SubmissionValues) => submitForm(submitUrl!, { values, rowKey }),
    onSuccess: (submission) => {
      setDone(submission);
      setInputs({});
      void queryClient.invalidateQueries({ queryKey: ['form', formUrl] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'submissions'] });
    },
  });

  if (form.error) return <ErrorMessage error={form.error} />;
  if (prefill.error) return <ErrorMessage error={prefill.error} />;
  if (!form.data || (rowKey !== undefined && !prefill.data)) return <p>{t('common.loading')}</p>;
  const { fields, state, title, intro, successMessage, closesAt } = form.data;
  const initial = prefill.data?.values ?? {};
  const valueOf = (key: string) => (key in inputs ? inputs[key] : toInput(initial[key]));

  const fieldErrors =
    submit.error instanceof ApiRequestError && submit.error.code === 'VALIDATION_FAILED'
      ? ((submit.error.error.details.fields ?? {}) as Record<string, string[]>)
      : {};
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
      {state !== 'open' && (
        <p className="notice" role="status">
          {t(`forms.state.${state}`)}
        </p>
      )}
      {state === 'open' && closesAt && (
        <p className="muted">
          {t('forms.closesAt', { date: new Date(closesAt).toLocaleString('fr-FR') })}
        </p>
      )}
      {done ? (
        <div className="notice" role="status">
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
        </div>
      ) : (
        <>
          {fields.map((field) => {
            const errors = fieldErrors[`values.${field.key}`];
            return (
              <div
                key={field.key}
                className={field.type === 'checkbox' ? 'form-field inline' : 'form-field'}
              >
                <label htmlFor={`field-${field.key}`}>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </label>
                <FieldInput
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
              <button type="submit" disabled={state !== 'open' || submit.isPending}>
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

/**
 * « Proposer une modification » sur une ligne de Tableau ou une carte de
 * Catalogue : ouvre le formulaire de ligne relié, pré-rempli.
 */
export function RowFormButtons({
  forms,
  rowKeys,
}: {
  forms: RowFormLink[];
  rowKeys: Record<string, string> | undefined;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<RowFormLink | null>(null);
  if (forms.length === 0 || !rowKeys) return null;
  return (
    <div className="row-forms">
      {forms.map((form) =>
        rowKeys[form.formId] ? (
          <button
            key={form.formId}
            type="button"
            className="link"
            onClick={() => setOpen(open?.formId === form.formId ? null : form)}
          >
            {forms.length > 1 ? form.title : t('forms.proposeChange')}
          </button>
        ) : null,
      )}
      {open && (
        <div className="row-form-panel">
          <FormView
            key={open.formId}
            formUrl={open.formUrl}
            submitUrl={open.submitUrl}
            rowKey={rowKeys[open.formId]}
            onCancel={() => setOpen(null)}
          />
        </div>
      )}
    </div>
  );
}
