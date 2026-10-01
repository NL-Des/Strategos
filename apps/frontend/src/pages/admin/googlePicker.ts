import type { GooglePickerSession } from '@strategos/shared';

/**
 * Sélecteur de fichiers Google (08) : la fenêtre de Google où l'admin choisit
 * ses Sheets. Strategos n'a ensuite accès qu'aux fichiers choisis ici. Le
 * script de Google n'est chargé qu'à la première ouverture.
 */
const SCRIPT_URL = 'https://apis.google.com/js/api.js';

interface PickerResponse {
  action: string;
  docs?: { id: string }[];
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: unknown) => { setMode(mode: unknown): unknown };
  ViewId: { SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Feature: { MULTISELECT_ENABLED: unknown };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: { load(api: string, options: { callback(): void; onerror(): void }): void };
    google?: { picker?: PickerApi };
  }
}

let loading: Promise<PickerApi> | null = null;

function loadPicker(): Promise<PickerApi> {
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => reject(new Error('picker'));
    script.onload = () => {
      window.gapi!.load('picker', {
        callback: () => resolve(window.google!.picker!),
        onerror: () => reject(new Error('picker')),
      });
    };
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null; // un nouvel essai recharge le script
    throw error;
  });
  return loading;
}

/** Ouvre le sélecteur ; renvoie les identifiants des Sheets choisis (aucun si l'admin annule). */
export async function pickGoogleSheets(session: GooglePickerSession): Promise<string[]> {
  const picker = await loadPicker();
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST);
    const builder = new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(session.accessToken)
      .setAppId(session.appId)
      .setOrigin(window.location.origin)
      .setLocale('fr')
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) {
          resolve((response.docs ?? []).map((doc) => doc.id));
        } else if (response.action === picker.Action.CANCEL) {
          resolve([]);
        }
      });
    if (session.apiKey) builder.setDeveloperKey(session.apiKey);
    builder.build().setVisible(true);
  });
}
