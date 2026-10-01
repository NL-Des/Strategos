import {
  THEME_BUTTON_STYLES,
  THEME_FONTS,
  THEME_NAME_MAX_LENGTH,
  THEME_RADIUS_MAX,
  THEME_TEXT_SIZE_MAX,
  THEME_TEXT_SIZE_MIN,
  type Theme,
  type ThemeConfig,
  type ThemeFont,
} from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { deleteTheme, getTheme, updateTheme } from '../../api/themes';
import { MediaPicker } from '../../builder/MediaPicker';
import { useConfirmed } from '../../components/Dialog';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';
import { ThemeScope } from '../../render/ThemeScope';

/** Admin › Thème : réglages par section et aperçu en direct (06 — Thèmes). */
export function ThemeEditorPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const theme = useQuery({ queryKey: ['admin', 'themes', id], queryFn: () => getTheme(id) });

  return (
    <section>
      <Link to="/admin/themes">{t('themes.back')}</Link>
      <ErrorMessage error={theme.error} />
      {theme.data && <ThemeEditor key={theme.data.id} theme={theme.data} />}
    </section>
  );
}

type Section = keyof ThemeConfig;

function ThemeEditor({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(theme.name);
  const [config, setConfig] = useState(theme.config);
  const toast = useToast();
  const confirmed = useConfirmed();
  const [pickingImage, setPickingImage] = useState(false);

  const set = <S extends Section>(section: S, patch: Partial<ThemeConfig[S]>) =>
    setConfig((c) => ({ ...c, [section]: { ...c[section], ...patch } }));

  const save = useMutation({
    mutationFn: () => updateTheme(theme.id, { name, config, version: theme.version }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['admin', 'themes', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'themes'], exact: true });
      toast(t('themes.saved'));
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteTheme(theme.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'themes'] });
      void navigate('/admin/themes', { replace: true });
    },
  });

  const color = (section: Section, key: string, label: string) => (
    <ColorField
      label={label}
      value={(config[section] as unknown as Record<string, string>)[key]!}
      onChange={(value) => set(section, { [key]: value })}
    />
  );
  const radius = (section: 'surface' | 'buttons' | 'cards' | 'discussions') => (
    <NumberField
      label={t('themes.fields.radius')}
      min={0}
      max={THEME_RADIUS_MAX}
      value={config[section].radius}
      onChange={(value) => set(section, { radius: value })}
    />
  );

  return (
    <>
      <h1>
        {theme.name}
        {theme.isDefault && <span className="badge">{t('themes.default')}</span>}
      </h1>
      <div className="theme-editor">
        <form
          className="form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label>
            {t('fields.name')}
            <input
              required
              maxLength={THEME_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <ThemeSection title={t('themes.sections.background')}>
            {color('background', 'color', t('themes.fields.color'))}
            <div className="form">
              <span>{t('themes.fields.image')}</span>
              {config.background.imageMediaId ? (
                <img
                  className="theme-image-thumb"
                  src={`/api/v1/media/${config.background.imageMediaId}`}
                  alt=""
                />
              ) : (
                <span className="muted">{t('themes.fields.noImage')}</span>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPickingImage(!pickingImage)}
                >
                  {t('themes.fields.chooseImage')}
                </button>
                {config.background.imageMediaId && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => set('background', { imageMediaId: null })}
                  >
                    {t('themes.fields.removeImage')}
                  </button>
                )}
              </div>
              {pickingImage && (
                <MediaPicker
                  value={config.background.imageMediaId ?? ''}
                  onChange={(mediaId) => {
                    set('background', { imageMediaId: mediaId });
                    setPickingImage(false);
                  }}
                />
              )}
            </div>
          </ThemeSection>

          <ThemeSection title={t('themes.sections.text')}>
            {color('text', 'color', t('themes.fields.textColor'))}
            {color('text', 'headingColor', t('themes.fields.headingColor'))}
            {color('text', 'linkColor', t('themes.fields.linkColor'))}
            <FontSelect
              label={t('themes.fields.font')}
              value={config.text.font}
              onChange={(font) => set('text', { font })}
            />
            <FontSelect
              label={t('themes.fields.headingFont')}
              value={config.text.headingFont}
              onChange={(headingFont) => set('text', { headingFont })}
            />
            <NumberField
              label={t('themes.fields.size')}
              min={THEME_TEXT_SIZE_MIN}
              max={THEME_TEXT_SIZE_MAX}
              value={config.text.size}
              onChange={(size) => set('text', { size })}
            />
          </ThemeSection>

          <ThemeSection title={t('themes.sections.surface')}>
            {color('surface', 'color', t('themes.fields.background'))}
            {color('surface', 'borderColor', t('themes.fields.borderColor'))}
            {radius('surface')}
          </ThemeSection>

          <ThemeSection title={t('themes.sections.buttons')}>
            <label>
              {t('themes.fields.style')}
              <select
                value={config.buttons.style}
                onChange={(e) =>
                  set('buttons', { style: e.target.value as (typeof THEME_BUTTON_STYLES)[number] })
                }
              >
                {THEME_BUTTON_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {t(`themes.buttonStyles.${style}`)}
                  </option>
                ))}
              </select>
            </label>
            {color('buttons', 'background', t('themes.fields.color'))}
            {color('buttons', 'color', t('themes.fields.buttonColor'))}
            {radius('buttons')}
          </ThemeSection>

          <ThemeSection title={t('themes.sections.tables')}>
            {color('tables', 'headerBackground', t('themes.fields.headerBackground'))}
            {color('tables', 'headerColor', t('themes.fields.headerColor'))}
            {color('tables', 'borderColor', t('themes.fields.borderColor'))}
            {color('tables', 'stripeColor', t('themes.fields.stripeColor'))}
          </ThemeSection>

          <ThemeSection title={t('themes.sections.cards')}>
            {color('cards', 'background', t('themes.fields.background'))}
            {color('cards', 'borderColor', t('themes.fields.borderColor'))}
            {color('cards', 'titleColor', t('themes.fields.titleColor'))}
            {radius('cards')}
            <label className="inline">
              <input
                type="checkbox"
                checked={config.cards.shadow}
                onChange={(e) => set('cards', { shadow: e.target.checked })}
              />
              {t('themes.fields.shadow')}
            </label>
          </ThemeSection>

          <ThemeSection title={t('themes.sections.discussions')}>
            {color('discussions', 'background', t('themes.fields.background'))}
            {color('discussions', 'borderColor', t('themes.fields.borderColor'))}
            {color('discussions', 'messageBackground', t('themes.fields.messageBackground'))}
            {color('discussions', 'authorColor', t('themes.fields.authorColor'))}
            {radius('discussions')}
          </ThemeSection>

          <ErrorMessage error={save.error ?? remove.error} />
          <div className="actions">
            <button type="submit" disabled={save.isPending}>
              {t('common.save')}
            </button>
            <button
              type="button"
              className="danger"
              disabled={remove.isPending || theme.isDefault}
              title={theme.isDefault ? t('themes.defaultProtected') : undefined}
              onClick={() =>
                confirmed(
                  {
                    title: t('themes.deleteConfirm', { name: theme.name }),
                    confirmLabel: t('common.delete'),
                    danger: true,
                  },
                  () => remove.mutate(),
                )
              }
            >
              {t('themes.delete')}
            </button>
          </div>
          {theme.isDefault && <p className="muted">{t('themes.defaultProtected')}</p>}
        </form>
        <aside className="theme-preview" aria-label={t('themes.preview')}>
          <h2>{t('themes.preview')}</h2>
          <ThemeSample config={config} />
        </aside>
      </div>
    </>
  );
}

function ThemeSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="theme-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline color-field">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      {label}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value)))))}
      />
    </label>
  );
}

function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ThemeFont;
  onChange: (font: ThemeFont) => void;
}) {
  const { t } = useTranslation();
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as ThemeFont)}>
        {THEME_FONTS.map((font) => (
          <option key={font} value={font}>
            {t(`themes.fonts.${font}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Échantillon fixe rendu avec le thème en cours de modification : titre,
 * texte, lien, boutons, tableau, carte de catalogue, sujet et message.
 */
function ThemeSample({ config }: { config: ThemeConfig }) {
  const { t } = useTranslation();
  const rows = t('themes.sample.table.rows', { returnObjects: true }) as string[][];
  return (
    <ThemeScope theme={config} className="theme-sample">
      <div className="zone">
        <h2>{t('themes.sample.heading')}</h2>
        <p>
          {t('themes.sample.text')} <a href="#sample">{t('themes.sample.link')}</a>.
        </p>
        <div className="block-buttons">
          <span className="theme-button">{t('themes.sample.button')}</span>
          <span className="theme-button">{t('themes.sample.button')}</span>
        </div>
        <div className="block-table">
          <table>
            <thead>
              <tr>
                <th>{t('themes.sample.table.name')}</th>
                <th>{t('themes.sample.table.level')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, level]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="format-number">{level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="catalog-grid per-row-1">
          <article className="catalog-card image_top">
            <div className="card-body">
              <h3>{t('themes.sample.cardTitle')}</h3>
              <p className="card-subtitle">{t('themes.sample.cardSubtitle')}</p>
              <dl>
                <div>
                  <dt>{t('themes.sample.cardDetail')}</dt>
                  <dd>{t('themes.sample.cardValue')}</dd>
                </div>
              </dl>
            </div>
          </article>
        </div>
        <section className="block-discussion">
          <h3>{t('themes.sample.discussion')}</h3>
          <article className="topic-message">
            <header>
              <strong>{t('themes.sample.author')}</strong>
            </header>
            <div className="message-body">{t('themes.sample.message')}</div>
          </article>
        </section>
      </div>
    </ThemeScope>
  );
}
