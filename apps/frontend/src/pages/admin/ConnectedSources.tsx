import type { OneDriveItem } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addSource,
  browseOneDrive,
  getGooglePicker,
  getGoogleStatus,
  getOneDriveStatus,
  googleConnectUrl,
  oneDriveConnectUrl,
} from '../../api/sources';
import { ErrorMessage } from '../../components/ErrorMessage';
import { pickGoogleSheets } from './googlePicker';

/** Le sélecteur de Google n'a pas pu s'ouvrir (script bloqué, réseau…). */
class PickerError extends Error {}

const refreshSources = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });

/**
 * Google Sheets (04 — Sources) : l'admin connecte son compte Google, puis
 * choisit ses Sheets dans le sélecteur de Google. Strategos n'accède qu'aux
 * fichiers choisis ; l'accès de chacun est testé à l'ajout.
 */
export function GoogleSheetsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['admin', 'google'], queryFn: getGoogleStatus });
  const pick = useMutation({
    mutationFn: async () => {
      const session = await getGooglePicker();
      const ids = await pickGoogleSheets(session).catch(() => {
        throw new PickerError();
      });
      for (const spreadsheetId of ids) await addSource({ type: 'gsheet', spreadsheetId });
    },
    onSettled: () => {
      void refreshSources(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'google'] });
    },
  });
  const outcome = new URLSearchParams(window.location.search).get('google');
  const s = status.data;

  return (
    <div className="card form">
      <h2>{t('sources.gsheet.title')}</h2>
      {outcome === 'connected' && <p className="notice">{t('sources.gsheet.connectedNow')}</p>}
      {outcome === 'failed' && <p className="error">{t('errors.SOURCE_AUTH_FAILED')}</p>}
      {s && !s.configured && <p className="muted">{t('sources.gsheet.notConfigured')}</p>}
      {s?.configured && (
        <>
          <p>
            {s.connected
              ? t('sources.gsheet.connected', { account: s.accountLabel })
              : s.expired
                ? t('sources.gsheet.expired')
                : t('sources.gsheet.notConnected')}
          </p>
          {pick.error instanceof PickerError ? (
            <p className="error">{t('sources.gsheet.pickerFailed')}</p>
          ) : (
            <ErrorMessage error={pick.error} />
          )}
          <div className="actions">
            <a className="button secondary" href={googleConnectUrl}>
              {s.connected || s.expired
                ? t('sources.gsheet.reconnect')
                : t('sources.gsheet.connect')}
            </a>
            {s.connected && (
              <button type="button" disabled={pick.isPending} onClick={() => pick.mutate()}>
                {t('sources.gsheet.pick')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
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
