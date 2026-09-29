import type { InstanceSettings } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listPages } from '../../api/pages';
import { getSettings, updateSettings } from '../../api/settings';
import { listThemes } from '../../api/themes';
import { ME_KEY } from '../../auth/useMe';
import { ErrorMessage } from '../../components/ErrorMessage';

/** Admin › Réglages de l'instance (04). Le téléchargement des sauvegardes arrive à l'étape 12. */
export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: getSettings });
  if (settings.error) return <ErrorMessage error={settings.error} />;
  if (!settings.data) return <p>{t('common.loading')}</p>;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: InstanceSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const themes = useQuery({ queryKey: ['admin', 'themes'], queryFn: listThemes });
  const save = useMutation({
    mutationFn: () => updateSettings(form),
    onSuccess: (next) => {
      queryClient.setQueryData(['admin', 'settings'], next);
      setForm(next);
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      setNotice(t('settings.saved'));
    },
  });

  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h1>{t('settings.title')}</h1>
      <label>
        {t('settings.landingPage')}
        <select
          value={form.landingPageId ?? ''}
          onChange={(e) => setForm({ ...form, landingPageId: e.target.value || null })}
        >
          <option value="">{t('settings.noLandingPage')}</option>
          {pages.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.publishedAt ? '' : ` (${t('builder.pages.neverPublished')})`}
            </option>
          ))}
        </select>
        <small>{t('settings.landingPageHint')}</small>
      </label>
      <label>
        {t('settings.defaultTheme')}
        <select
          value={form.defaultThemeId}
          onChange={(e) => setForm({ ...form, defaultThemeId: e.target.value })}
        >
          {themes.data?.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('settings.backupRetention')}
        <input
          type="number"
          min={1}
          max={3650}
          required
          value={form.backupRetentionDays}
          onChange={(e) => setForm({ ...form, backupRetentionDays: Number(e.target.value) })}
        />
      </label>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <ErrorMessage error={save.error} />
      <button type="submit" disabled={save.isPending}>
        {t('common.save')}
      </button>
    </form>
  );
}
