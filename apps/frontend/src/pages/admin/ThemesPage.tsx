import { DEFAULT_THEME_CONFIG, THEME_NAME_MAX_LENGTH } from '@strategos/shared';
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
                </td>
                <td>
                  <span className="theme-swatches" aria-hidden="true">
                    {[
                      theme.config.background.color,
                      theme.config.text.color,
                      theme.config.buttons.background,
                      theme.config.surface.color,
                    ].map((color, i) => (
                      <span key={i} style={{ background: color }} />
                    ))}
                  </span>
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

/** Un nouveau thème part des réglages du thème « Sobre ». */
function CreateThemeForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: () => createTheme({ name, config: DEFAULT_THEME_CONFIG }),
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
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending}>
        {t('themes.createSubmit')}
      </button>
    </form>
  );
}
