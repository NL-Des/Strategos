import { TEMPLATE_NAME_MAX_LENGTH, type TemplateType } from '@strategos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTemplate } from '../api/templates';
import { ErrorMessage } from './ErrorMessage';

/**
 * « Enregistrer comme modèle » (10) : la réalisation est copiée dans la
 * bibliothèque, sans mappings ni plages.
 */
export function SaveAsTemplate({
  type,
  sourceId,
  defaultName = '',
}: {
  type: TemplateType;
  sourceId: string;
  defaultName?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const save = useMutation({
    mutationFn: () => createTemplate({ type, sourceId, name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'templates'] });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <span className="save-template">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            save.reset();
            setOpen(true);
          }}
        >
          {t('templates.save')}
        </button>
        {save.isSuccess && (
          <span className="notice" role="status">
            {' '}
            {t('templates.saved')}
          </span>
        )}
      </span>
    );
  }
  return (
    // Pas de <form> : ce bouton peut se trouver dans un autre formulaire.
    <div className="card form save-template">
      <p className="muted">{t(`templates.saveHint.${type}`)}</p>
      <label>
        {t('templates.name')}
        <input
          required
          maxLength={TEMPLATE_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <ErrorMessage error={save.error} />
      <div className="actions">
        <button
          type="button"
          disabled={save.isPending || !name.trim()}
          onClick={() => save.mutate()}
        >
          {t('templates.saveSubmit')}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
