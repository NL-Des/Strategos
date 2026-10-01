import type { MediaItem } from '@strategos/shared';
import { MEDIA_MAX_BYTES } from '@strategos/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../api/client';
import { deleteMedia, listMedia, uploadMedia } from '../../api/media';
import { useConfirm } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';
import { Pagination } from '../../components/Pagination';

interface Usages {
  pages: { id: string; name: string }[];
  layouts: string[];
  themes: { id: string; name: string }[];
}

/** Admin › Médiathèque : images accessibles à tout utilisateur connecté. */
export function MediaPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [alt, setAlt] = useState('');
  const ask = useConfirm();
  const toast = useToast();
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
      toast(t('builder.media.uploaded'));
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: ({ item, confirm }: { item: MediaItem; confirm: boolean }) =>
      deleteMedia(item.id, confirm),
    onSuccess: () => void refresh(),
    // Image utilisée : la fenêtre liste où, avant de supprimer quand même.
    onError: (error, { item }) => {
      if (!(error instanceof ApiRequestError) || error.code !== 'CONFIRMATION_REQUIRED') return;
      const [warning] = (error.error.details.warnings ?? []) as Partial<Usages>[];
      void ask({
        title: t('warnings.MEDIA_IN_USE', { filename: item.filename }),
        message: (
          <ul>
            {warning?.pages?.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
            {warning?.layouts?.map((kind) => (
              <li key={kind}>{t(`builder.zoneNames.${kind}`)}</li>
            ))}
            {warning?.themes?.map((theme) => (
              <li key={theme.id}>{t('builder.media.themeUsage', { name: theme.name })}</li>
            ))}
          </ul>
        ),
        confirmLabel: t('builder.media.deleteAnyway'),
        danger: true,
      }).then((ok) => {
        if (ok) remove.mutate({ item, confirm: true });
      });
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
                onClick={() =>
                  void ask({
                    title: t('builder.media.deleteConfirm', { filename: item.filename }),
                    confirmLabel: t('common.delete'),
                    danger: true,
                  }).then((ok) => {
                    if (ok) remove.mutate({ item, confirm: false });
                  })
                }
              >
                {t('builder.remove')}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {media.data?.items.length === 0 && (
        <EmptyState icon="image">{t('builder.media.empty')}</EmptyState>
      )}
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
