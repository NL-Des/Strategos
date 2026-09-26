import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listMedia } from '../api/media';

/** Choix d'une image de la médiathèque. */
export function MediaPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (mediaId: string, alt: string | null) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const media = useQuery({
    queryKey: ['admin', 'media', 'picker', q],
    queryFn: () => listMedia(1, q, 200),
  });

  return (
    <div className="media-picker">
      <input
        type="search"
        placeholder={t('builder.media.search')}
        aria-label={t('builder.media.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="media-grid small">
        {media.data?.items.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`media-tile${m.id === value ? ' selected' : ''}`}
            aria-pressed={m.id === value}
            title={m.filename}
            onClick={() => onChange(m.id, m.alt)}
          >
            <img src={m.url} alt="" />
            <span>{m.filename}</span>
          </button>
        ))}
      </div>
      {media.data?.items.length === 0 && <p className="muted">{t('builder.media.empty')}</p>}
    </div>
  );
}
