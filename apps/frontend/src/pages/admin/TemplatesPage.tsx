import { type TemplateSummary, TemplateType } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { getRightsMatrix } from '../../api/rights';
import { deleteTemplate, instantiateTemplate, listTemplates } from '../../api/templates';
import { ErrorMessage } from '../../components/ErrorMessage';

/**
 * Admin › Modèles (10) : bibliothèque des formulaires, pages et sujets
 * enregistrés. Une page s'instancie ici ; un sujet, dans l'espace choisi ; un
 * formulaire, depuis un module Formulaire de l'éditeur de page.
 */
export function TemplatesPage() {
  const { t } = useTranslation();
  const [type, setType] = useState<TemplateType | ''>('');
  const templates = useQuery({
    queryKey: ['admin', 'templates', type],
    queryFn: () => listTemplates(type || undefined),
  });

  return (
    <section>
      <h1>{t('templates.title')}</h1>
      <p className="muted">{t('templates.intro')}</p>
      <div className="filters">
        <select
          aria-label={t('templates.type')}
          value={type}
          onChange={(e) => setType(e.target.value as TemplateType | '')}
        >
          <option value="">{t('templates.allTypes')}</option>
          {Object.values(TemplateType).map((ty) => (
            <option key={ty} value={ty}>
              {t(`templates.types.${ty}`)}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage error={templates.error} />
      {templates.data?.length === 0 && <p className="muted">{t('templates.empty')}</p>}
      {templates.data?.map((template) => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </section>
  );
}

function TemplateCard({ template }: { template: TemplateSummary }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteTemplate(template.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] }),
  });
  const { details } = template;

  return (
    <article className="card">
      <h2>
        {template.name} <span className="badge muted">{t(`templates.types.${template.type}`)}</span>
      </h2>
      <p className="muted">
        {template.type === 'form' &&
          t('templates.details.form', {
            mode: t(`builder.form.modes.${details.mode}`),
            count: details.fields,
          })}
        {template.type === 'page' && t('templates.details.page', { count: details.blocks })}
        {template.type === 'topic' && t('templates.details.topic', { title: details.title })}
      </p>
      {template.type === 'page' && <InstantiatePage template={template} />}
      {template.type === 'topic' && <InstantiateTopic template={template} />}
      {template.type === 'form' && <p className="muted">{t('templates.formHint')}</p>}
      <ErrorMessage error={remove.error} />
      <button
        type="button"
        className="danger"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(t('templates.deleteConfirm', { name: template.name })))
            remove.mutate();
        }}
      >
        {t('common.delete')}
      </button>
    </article>
  );
}

/** Nouvelle page en brouillon, sans permission, ouverte dans l'éditeur. */
function InstantiatePage({ template }: { template: TemplateSummary }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name.slice(0, 100));
  const create = useMutation({
    mutationFn: () => instantiateTemplate(template.id, { name }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'pages'] });
      if (result.type === 'page') void navigate(`/admin/pages/${result.pageId}`);
    },
  });
  return (
    <div className="form">
      <p className="muted">{t('templates.pageHint')}</p>
      <label>
        {t('templates.pageName')}
        <input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ErrorMessage error={create.error} />
      <button
        type="button"
        disabled={create.isPending || !name.trim()}
        onClick={() => create.mutate()}
      >
        {t('templates.instantiatePage')}
      </button>
    </div>
  );
}

/** Sujet ouvert par l'admin dans l'espace choisi : titre et message d'ouverture. */
function InstantiateTopic({ template }: { template: TemplateSummary }) {
  const { t } = useTranslation();
  const [spaceId, setSpaceId] = useState('');
  const spaces = useQuery({
    queryKey: ['admin', 'rights', 'spaces'],
    queryFn: () => getRightsMatrix({ page: 1, pageSize: 1, type: 'space' }),
  });
  const create = useMutation({ mutationFn: () => instantiateTemplate(template.id, { spaceId }) });
  return (
    <div className="form">
      <label>
        {t('templates.space')}
        <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
          <option value="">{t('templates.chooseSpace')}</option>
          {spaces.data?.resources.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <ErrorMessage error={create.error ?? spaces.error} />
      {create.isSuccess && (
        <p className="notice" role="status">
          {t('templates.topicCreated')}
        </p>
      )}
      <button type="button" disabled={create.isPending || !spaceId} onClick={() => create.mutate()}>
        {t('templates.instantiateTopic')}
      </button>
    </div>
  );
}
