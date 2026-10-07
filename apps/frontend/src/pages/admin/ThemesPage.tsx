import { THEME_NAME_MAX_LENGTH, THEME_PRESETS, type ThemeConfig } from '@strategos/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { createTheme, listThemes } from '../../api/themes';
import { ErrorMessage } from '../../components/ErrorMessage';
import { EmptyState } from '../../components/EmptyState';
import { CreatePanel } from '../../components/CreatePanel';

/** Admin › Thèmes : liste et création (06 — Thèmes). */
export function ThemesPage() {
  const { t } = useTranslation();
  const themes = useQuery({ queryKey: ['admin', 'themes'], queryFn: listThemes });

  return (
    <section>
      <h1>{t('themes.title')}</h1>
      <p className="muted">{t('themes.intro')}</p>
      <CreatePanel label={t('themes.create')}>
        <CreateThemeForm />
      </CreatePanel>
      <ErrorMessage error={themes.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('fields.name')}</th>
              <th>{t('themes.preview')}</th>
            </tr>
          </thead>
          <tbody>
            {themes.data?.map((theme) => (
              <tr key={theme.id}>
                <td>
                  <Link to={`/admin/themes/${theme.id}`}>{theme.name}</Link>
                  {theme.isDefault && <span className="badge">{t('themes.default')}</span>}
                  {theme.isDark && <span className="badge">{t('themes.darkMode')}</span>}
                </td>
                <td>
                  <Swatches config={theme.config} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {themes.data?.length === 0 && <EmptyState>{t('themes.empty')}</EmptyState>}
    </section>
  );
}

/** Pastilles d'un thème : fond, texte, boutons et encadrés. */
function Swatches({ config }: { config: ThemeConfig }) {
  return (
    <span className="theme-swatches" aria-hidden="true">
      {[
        config.background.color,
        config.text.color,
        config.buttons.background,
        config.surface.color,
      ].map((color, i) => (
        <span key={i} style={{ background: color }} />
      ))}
    </span>
  );
}

/** Un nouveau thème part des réglages d'un thème fourni, « Sobre » par défaut. */
function CreateThemeForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [presetKey, setPresetKey] = useState(THEME_PRESETS[0]!.key);
  const preset = THEME_PRESETS.find((p) => p.key === presetKey) ?? THEME_PRESETS[0]!;
  const mutation = useMutation({
    mutationFn: () => createTheme({ name, config: preset.config }),
    onSuccess: (theme) => void navigate(`/admin/themes/${theme.id}`),
  });

  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2>{t('themes.create')}</h2>
      <label>
        {t('fields.name')}
        <input
          required
          maxLength={THEME_NAME_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        {t('themes.startFrom')}
        <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
          {THEME_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
              {p.dark ? ` (${t('themes.darkPreset')})` : ''}
            </option>
          ))}
        </select>
        <Swatches config={preset.config} />
      </label>
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending}>
        {t('themes.createSubmit')}
      </button>
    </form>
  );
}
