import { useSyncExternalStore } from 'react';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'strategos.colorMode';
const listeners = new Set<() => void>();

/** Le stockage du navigateur peut être refusé (navigation privée) : le mode reste alors clair. */
function stored(): ColorMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let current = stored();

/** Pose le mode sur `<html>` : `tokens.css` en tire les jetons sombres de l'interface. */
export function applyColorMode(): void {
  document.documentElement.dataset.colorMode = current;
}

function change(mode: ColorMode): void {
  current = mode;
  applyColorMode();
  for (const listener of listeners) listener();
}

export function setColorMode(mode: ColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Choix non retenu : il vaut quand même jusqu'à la fermeture de l'onglet.
  }
  change(mode);
}

function subscribe(listener: () => void): () => void {
  // Un autre onglet a changé de mode : celui-ci suit.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) change(stored());
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Mode clair ou sombre (06 — Thèmes) : choisi par chaque utilisateur dans le menu
 * de compte, et retenu dans son navigateur. Il vaut donc dès l'écran de connexion.
 */
export function useColorMode(): ColorMode {
  return useSyncExternalStore(subscribe, () => current);
}
