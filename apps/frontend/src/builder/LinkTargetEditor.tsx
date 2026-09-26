import type { LinkTarget } from '@strategos/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listPages } from '../api/pages';

/** Destination d'un lien : page interne, URL externe ou « Ma page personnelle ». */
export function LinkTargetEditor({
  value,
  onChange,
  optional = false,
}: {
  value: LinkTarget | undefined;
  onChange: (value: LinkTarget | undefined) => void;
  optional?: boolean;
}) {
  const { t } = useTranslation();
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const kind = value?.kind ?? '';

  return (
    <div className="link-editor">
      <select
        aria-label={t('builder.link.kind')}
        value={kind}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'page') onChange({ kind: 'page', pageId: '' });
          else if (next === 'url') onChange({ kind: 'url', url: 'https://' });
          else if (next === 'personal_page') onChange({ kind: 'personal_page' });
          else onChange(undefined);
        }}
      >
        {optional && <option value="">{t('builder.link.none')}</option>}
        <option value="page">{t('builder.link.page')}</option>
        <option value="url">{t('builder.link.url')}</option>
        <option value="personal_page">{t('builder.link.personalPage')}</option>
      </select>
      {value?.kind === 'page' && (
        <select
          aria-label={t('builder.link.page')}
          value={value.pageId ?? ''}
          onChange={(e) => onChange({ kind: 'page', pageId: e.target.value })}
        >
          <option value="">{t('builder.link.choosePage')}</option>
          {pages.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.publishedAt ? '' : ` (${t('builder.pages.neverPublished')})`}
            </option>
          ))}
        </select>
      )}
      {value?.kind === 'url' && (
        <input
          type="url"
          aria-label={t('builder.link.url')}
          value={value.url ?? ''}
          onChange={(e) => onChange({ kind: 'url', url: e.target.value })}
        />
      )}
    </div>
  );
}
