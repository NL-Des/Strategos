import { type BackupSummary, ExternalImages, type InstanceSettings } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { backupDownloadUrl, listBackups } from '../../api/backups';
import { listPages } from '../../api/pages';
import { getSettings, updateSettings } from '../../api/settings';
import { listThemes } from '../../api/themes';
import { ME_KEY } from '../../auth/useMe';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Loading } from '../../components/Loading';
import { useToast } from '../../components/Toast';
import { EmptyState } from '../../components/EmptyState';

/** Admin › Réglages de l'instance (04) et sauvegardes (11). */
export function SettingsPage() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: getSettings });
  if (settings.error) return <ErrorMessage error={settings.error} />;
  if (!settings.data) return <Loading />;
  return (
    <>
      <SettingsForm initial={settings.data} />
      <Backups />
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Sauvegardes quotidiennes : liste et téléchargement, pour emporter une copie hors du serveur. */
function Backups() {
  const { t } = useTranslation();
  const backups = useQuery({ queryKey: ['admin', 'backups'], queryFn: listBackups });
  return (
    <section className="card">
      <h2>{t('backups.title')}</h2>
      <p className="muted">{t('backups.intro')}</p>
      <ErrorMessage error={backups.error} />
      {backups.data?.length === 0 && <EmptyState>{t('backups.empty')}</EmptyState>}
      {backups.data && backups.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('backups.date')}</th>
                <th>{t('backups.status')}</th>
                <th>{t('backups.size')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {backups.data.map((backup) => (
                <BackupRow key={backup.id} backup={backup} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BackupRow({ backup }: { backup: BackupSummary }) {
  const { t } = useTranslation();
  return (
    <tr>
      <td>{formatDate(backup.createdAt)}</td>
      <td>
        {t(`backups.statuses.${backup.status}`)}
        {backup.error && <small className="block">{backup.error}</small>}
      </td>
      <td>{backup.sizeBytes !== null && formatSize(backup.sizeBytes)}</td>
      <td>
        {backup.status === 'ok' && (
          <a className="button secondary" href={backupDownloadUrl(backup.id)} download>
            {t('backups.download')}
          </a>
        )}
      </td>
    </tr>
  );
}

function SettingsForm({ initial }: { initial: InstanceSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  // Un domaine par ligne ; la liste n'est lue qu'à l'enregistrement.
  const [domains, setDomains] = useState(initial.externalImageDomains.join('\n'));
  const toast = useToast();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const themes = useQuery({ queryKey: ['admin', 'themes'], queryFn: listThemes });
  const save = useMutation({
    mutationFn: () =>
      updateSettings({
        ...form,
        externalImageDomains: domains
          .split(/[\s,;]+/)
          .map((domain) => domain.trim())
          .filter(Boolean),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['admin', 'settings'], next);
      setForm(next);
      setDomains(next.externalImageDomains.join('\n'));
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      toast(t('settings.saved'));
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
        {t('settings.darkTheme')}
        <select
          value={form.darkThemeId ?? ''}
          onChange={(e) => setForm({ ...form, darkThemeId: e.target.value || null })}
        >
          <option value="">{t('settings.noDarkTheme')}</option>
          {themes.data?.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
        <small>{t('settings.darkThemeHint')}</small>
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
      <label>
        {t('settings.externalImages')}
        <select
          value={form.externalImages}
          onChange={(e) => setForm({ ...form, externalImages: e.target.value as ExternalImages })}
        >
          {Object.values(ExternalImages).map((mode) => (
            <option key={mode} value={mode}>
              {t(`settings.externalImagesModes.${mode}`)}
            </option>
          ))}
        </select>
        <small>{t('settings.externalImagesHint')}</small>
      </label>
      {form.externalImages === ExternalImages.allowlist && (
        <label>
          {t('fields.externalImageDomains')}
          <textarea
            rows={4}
            value={domains}
            placeholder="images.exemple.fr"
            onChange={(e) => setDomains(e.target.value)}
          />
          <small>{t('settings.externalImageDomainsHint')}</small>
        </label>
      )}
      <ErrorMessage error={save.error} />
      <button type="submit" disabled={save.isPending}>
        {t('common.save')}
      </button>
    </form>
  );
}
