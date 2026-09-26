import type { MediaItem } from '@strategos/shared';
import { MEDIA_MAX_BYTES } from '@strategos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../api/client';
import { deleteMedia, listMedia, uploadMedia } from '../../api/media';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Pagination } from '../../components/Pagination';

interface InUse {
  media: MediaItem;
  pages: { id: string; name: string }[];
  layouts: string[];
}

/** Admin › Médiathèque : images accessibles à tout utilisateur connecté. */
export function MediaPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [alt, setAlt] = useState('');
  const [inUse, setInUse] = useState<InUse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const media = useQuery({
    queryKey: ['admin', 'media', page, q],
    queryFn: () => listMedia(page, q),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'media'] });

  const upload = useMutation({
    mutationFn: (file: File) => uploadMedia(file, alt),
    onSuccess: () => {
      setAlt('');
      if (fileInput.current) fileInput.current.value = '';
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: ({ item, confirm }: { item: MediaItem; confirm: boolean }) =>
      deleteMedia(item.id, confirm),
    onSuccess: () => {
      setInUse(null);
      void refresh();
    },
    onError: (error, { item }) => {
      if (error instanceof ApiRequestError && error.code === 'CONFIRMATION_REQUIRED') {
        const [warning] = (error.error.details.warnings ?? []) as Omit<InUse, 'media'>[];
        setInUse({ media: item, pages: warning?.pages ?? [], layouts: warning?.layouts ?? [] });
      }
    },
  });
  const removeError =
    remove.error instanceof ApiRequestError && remove.error.code === 'CONFIRMATION_REQUIRED'
      ? null
      : remove.error;

  return (
    <section>
      <h1>{t('builder.media.title')}</h1>
      <p className="muted">{t('builder.media.intro')}</p>
      <form
        className="card form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const file = fileInput.current?.files?.[0];
          if (file) upload.mutate(file);
        }}
      >
        <h2>{t('builder.media.upload')}</h2>
        <label>
          {t('builder.media.file')}
          <input
            ref={fileInput}
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,image/gif"
          />
          <small>{t('builder.media.limits', { mb: MEDIA_MAX_BYTES / 1024 / 1024 })}</small>
        </label>
        <label>
          {t('builder.image.alt')}
          <input value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
        </label>
        <ErrorMessage error={upload.error} />
        <button type="submit" disabled={upload.isPending}>
          {t('builder.media.uploadSubmit')}
        </button>
      </form>

      {inUse && (
        <div className="card warning" role="alertdialog" aria-labelledby="media-in-use">
          <p id="media-in-use">{t('warnings.MEDIA_IN_USE', { filename: inUse.media.filename })}</p>
          <ul>
            {inUse.pages.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {inUse.layouts.map((kind) => (
              <li key={kind}>{t(`builder.zoneNames.${kind}`)}</li>
            ))}
          </ul>
          <div className="actions">
            <button
              type="button"
              className="danger"
              onClick={() => remove.mutate({ item: inUse.media, confirm: true })}
            >
              {t('builder.media.deleteAnyway')}
            </button>
            <button type="button" className="secondary" onClick={() => setInUse(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="filters">
        <input
          type="search"
          placeholder={t('builder.media.search')}
          aria-label={t('builder.media.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <ErrorMessage error={media.error ?? removeError} />
      <div className="media-grid">
        {media.data?.items.map((item) => (
          <figure key={item.id} className="media-tile">
            <img src={item.url} alt={item.alt ?? ''} />
            <figcaption>
              <span>{item.filename}</span>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (
                    window.confirm(t('builder.media.deleteConfirm', { filename: item.filename }))
                  ) {
                    remove.mutate({ item, confirm: false });
                  }
                }}
              >
                {t('builder.remove')}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {media.data?.items.length === 0 && <p className="muted">{t('builder.media.empty')}</p>}
      {media.data && (
        <Pagination
          page={page}
          total={media.data.total}
          pageSize={media.data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  );
}
