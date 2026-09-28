import type { OneDriveItem } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addSource,
  browseOneDrive,
  getOneDriveStatus,
  getServiceAccount,
  oneDriveConnectUrl,
} from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';

const refreshSources = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });

/**
 * Ajout d'un Google Sheet (04 — Sources) : l'admin le partage avec l'adresse
 * du compte de service, puis colle son lien ; l'accès est testé à l'ajout.
 */
export function GoogleSheetForm() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const account = useQuery({ queryKey: ['admin', 'service-account'], queryFn: getServiceAccount });
  const add = useMutation({
    mutationFn: () => addSource({ type: 'gsheet', url }),
    onSuccess: () => {
      setUrl('');
      void refreshSources(queryClient);
    },
  });
  if (account.data && !account.data.email) {
    return (
      <div className="card">
        <h2>{t('sources.gsheet.title')}</h2>
        <p className="muted">{t('sources.gsheet.notConfigured')}</p>
      </div>
    );
  }
  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2>{t('sources.gsheet.title')}</h2>
      <p>
        {t('sources.gsheet.share')} <code>{account.data?.email ?? '…'}</code>
      </p>
      <label>
        {t('sources.gsheet.url')}
        <input
          required
          value={url}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <ErrorMessage error={add.error} />
      <button type="submit" disabled={add.isPending}>
        {t('sources.gsheet.add')}
      </button>
    </form>
  );
}

/** Connexion OneDrive (accès délégué) et choix d'un fichier `.xlsx`. */
export function OneDrivePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [path, setPath] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['admin', 'onedrive'], queryFn: getOneDriveStatus });
  const items = useQuery({
    queryKey: ['admin', 'onedrive', 'browse', path],
    queryFn: () => browseOneDrive(path ?? ''),
    enabled: path !== null,
  });
  const add = useMutation({
    mutationFn: (item: OneDriveItem) => addSource({ type: 'onedrive', itemId: item.id }),
    onSuccess: () => {
      setPath(null);
      void refreshSources(queryClient);
    },
  });
  const outcome = new URLSearchParams(window.location.search).get('onedrive');
  const s = status.data;

  return (
    <div className="card form">
      <h2>{t('sources.onedrive.title')}</h2>
      {outcome === 'connected' && <p className="notice">{t('sources.onedrive.connectedNow')}</p>}
      {outcome === 'failed' && <p className="error">{t('errors.SOURCE_AUTH_FAILED')}</p>}
      {s && !s.configured && <p className="muted">{t('sources.onedrive.notConfigured')}</p>}
      {s?.configured && (
        <>
          <p>
            {s.connected
              ? t('sources.onedrive.connected', { account: s.accountLabel })
              : s.expired
                ? t('sources.onedrive.expired')
                : t('sources.onedrive.notConnected')}
          </p>
          <div className="actions">
            <a className="button secondary" href={oneDriveConnectUrl}>
              {s.connected || s.expired
                ? t('sources.onedrive.reconnect')
                : t('sources.onedrive.connect')}
            </a>
            {s.connected && path === null && (
              <button type="button" className="secondary" onClick={() => setPath('')}>
                {t('sources.onedrive.browse')}
              </button>
            )}
          </div>
        </>
      )}
      {path !== null && (
        <div className="onedrive-browser">
          <p>
            <strong>{path || t('sources.onedrive.root')}</strong>{' '}
            {path && (
              <button
                type="button"
                className="link"
                onClick={() => setPath(path.split('/').slice(0, -1).join('/'))}
              >
                {t('sources.onedrive.up')}
              </button>
            )}
          </p>
          <ErrorMessage error={items.error ?? add.error} />
          <ul>
            {items.data?.map((item) => (
              <li key={item.id}>
                {item.folder ? (
                  <button type="button" className="link" onClick={() => setPath(item.path)}>
                    📁 {item.name}
                  </button>
                ) : (
                  <>
                    {item.name}{' '}
                    <button
                      type="button"
                      className="secondary"
                      disabled={add.isPending}
                      onClick={() => add.mutate(item)}
                    >
                      {t('sources.onedrive.add')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {items.data?.length === 0 && <p className="muted">{t('sources.onedrive.emptyFolder')}</p>}
          <button type="button" className="secondary" onClick={() => setPath(null)}>
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  );
}
