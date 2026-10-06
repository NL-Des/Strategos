import type { GoogleStatus, OneDriveItem } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addSource,
  browseOneDrive,
  getGooglePicker,
  getGoogleStatus,
  getOneDriveStatus,
  googleConnectUrl,
  newSourceScript,
  oneDriveConnectUrl,
  setGoogleConfig,
} from '../../api/sources';
import { useConfirm } from '../../components/Dialog';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useToast } from '../../components/Toast';
import { pickGoogleSheets } from './googlePicker';
import { Icon } from '../../components/Icon';

/** Le sélecteur de Google n'a pas pu s'ouvrir (script bloqué, réseau…). */
class PickerError extends Error {}

const refreshSources = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });

const GOOGLE_CONSOLE = 'https://console.cloud.google.com/';
const SETUP_STEPS = ['project', 'apis', 'consent', 'client', 'apiKey'] as const;

/**
 * Identifiants du projet Google Cloud (04 — Sources) : le pas à pas dans la
 * console Google, les deux adresses à y déclarer, puis les valeurs à coller.
 * Le code secret n'est jamais relu : le remplacer demande de le ressaisir.
 */
function GoogleSetup({ status }: { status: GoogleStatus }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState(status.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const save = useMutation({
    mutationFn: () => setGoogleConfig({ clientId, clientSecret, apiKey }),
    onSuccess: () => {
      setClientSecret('');
      setApiKey('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'google'] });
      void refreshSources(queryClient);
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p>
        {t('sources.gsheet.setup.intro')}{' '}
        <a href={GOOGLE_CONSOLE} target="_blank" rel="noreferrer">
          {t('sources.gsheet.setup.console')}
        </a>
      </p>
      <ol>
        {SETUP_STEPS.map((step) => (
          <li key={step}>
            <strong>{t(`sources.gsheet.setup.steps.${step}.title`)}</strong>
            <ol>
              {(
                t(`sources.gsheet.setup.steps.${step}.items`, { returnObjects: true }) as string[]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            {i18n.exists(`sources.gsheet.setup.steps.${step}.note`) && (
              <small>{t(`sources.gsheet.setup.steps.${step}.note`)}</small>
            )}
          </li>
        ))}
      </ol>
      <label>
        {t('sources.gsheet.setup.origin')}
        <input readOnly value={window.location.origin} onFocus={(e) => e.target.select()} />
      </label>
      <label>
        {t('sources.gsheet.setup.redirectUri')}
        <input readOnly value={status.redirectUri} onFocus={(e) => e.target.select()} />
      </label>
      <label>
        {t('sources.gsheet.setup.clientId')}
        <input
          required
          value={clientId}
          placeholder="123456789-….apps.googleusercontent.com"
          onChange={(e) => setClientId(e.target.value)}
        />
      </label>
      <label>
        {t('sources.gsheet.setup.clientSecret')}
        <input
          required
          type="password"
          autoComplete="off"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </label>
      <label>
        {t('sources.gsheet.setup.apiKey')}
        <input
          required
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <small>{t('sources.gsheet.setup.secretHelp')}</small>
      </label>
      <ErrorMessage error={save.error} />
      <button type="submit" disabled={save.isPending}>
        {t('sources.gsheet.setup.save')}
      </button>
    </form>
  );
}

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
      {outcome === 'failed' && (
        <p className="error">
          {t(s?.managed ? 'sources.gsheet.connectFailedManaged' : 'sources.gsheet.connectFailed')}
        </p>
      )}
      {s && !s.configured && <GoogleSetup status={s} />}
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
          {!s.managed && (
            <details>
              <summary>{t('sources.gsheet.setup.title')}</summary>
              <GoogleSetup status={s} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Google Sheet partagé par lien public (04 — Sources) : sans compte Google, en
 * lecture seule. L'admin confirme que le document est lisible par quiconque a le lien.
 */
export function GoogleSheetLinkPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ask = useConfirm();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const add = useMutation({
    mutationFn: () => addSource({ type: 'gsheet_link', url, confirm: true }),
    onSuccess: (source) => {
      setUrl('');
      toast(t('sources.gsheetLink.added', { name: source.name }));
      void refreshSources(queryClient);
    },
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await ask({
      title: t('sources.gsheetLink.confirmTitle'),
      message: t('warnings.SOURCE_PUBLIC_LINK'),
      confirmLabel: t('sources.gsheetLink.confirm'),
    });
    if (ok) add.mutate();
  };

  return (
    <form className="card form" onSubmit={(e) => void submit(e)}>
      <h2>{t('sources.gsheetLink.title')}</h2>
      <p>{t('sources.gsheetLink.intro')}</p>
      <ol>
        {(t('sources.gsheetLink.steps', { returnObjects: true }) as string[]).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <label>
        {t('sources.gsheetLink.url')}
        <input
          required
          type="url"
          value={url}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <ErrorMessage error={add.error} />
      <button type="submit" disabled={add.isPending}>
        {t('sources.gsheetLink.add')}
      </button>
    </form>
  );
}

/** Script à coller dans le Sheet : texte en lecture seule et bouton de copie. */
export function ScriptBox({ script }: { script: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <>
      <label>
        {t('sources.gsheetScript.script')}
        <textarea readOnly rows={8} value={script} onFocus={(e) => e.target.select()} />
      </label>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          void navigator.clipboard
            .writeText(script)
            .then(() => toast(t('sources.gsheetScript.copied')))
        }
      >
        {t('sources.gsheetScript.copy')}
      </button>
    </>
  );
}

/**
 * Google Sheet relié par un script Apps Script (04 — Sources) : Strategos
 * prépare le script et son secret, l'admin le déploie dans son Sheet, puis
 * colle l'adresse du déploiement. Le secret ne quitte pas cet écran avant l'ajout.
 */
export function GoogleSheetScriptPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [scriptUrl, setScriptUrl] = useState('');
  const prepare = useMutation({ mutationFn: newSourceScript });
  const prepared = prepare.data;
  const add = useMutation({
    mutationFn: () =>
      addSource({ type: 'gsheet_script', scriptUrl, secret: prepared?.secret ?? '' }),
    onSuccess: (source) => {
      setScriptUrl('');
      prepare.reset();
      toast(t('sources.gsheetScript.added', { name: source.name }));
      void refreshSources(queryClient);
    },
  });

  return (
    <form
      className="card form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2>{t('sources.gsheetScript.title')}</h2>
      <p>{t('sources.gsheetScript.intro')}</p>
      <ErrorMessage error={prepare.error} />
      {!prepared && (
        <button type="button" disabled={prepare.isPending} onClick={() => prepare.mutate()}>
          {t('sources.gsheetScript.prepare')}
        </button>
      )}
      {prepared && (
        <>
          <ol>
            {(t('sources.gsheetScript.steps', { returnObjects: true }) as string[]).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ScriptBox script={prepared.script} />
          <p className="notice">{t('sources.gsheetScript.warning')}</p>
          <label>
            {t('sources.gsheetScript.url')}
            <input
              required
              type="url"
              value={scriptUrl}
              placeholder="https://script.google.com/macros/s/…/exec"
              onChange={(e) => setScriptUrl(e.target.value)}
            />
          </label>
          <ErrorMessage error={add.error} />
          <button type="submit" disabled={add.isPending}>
            {t('sources.gsheetScript.add')}
          </button>
        </>
      )}
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
                    <Icon name="folder" /> {item.name}
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
