/** Ports et comptes de l'instance lancée pour les tests navigateur (global-setup.ts). */
export const PORTS = { fakeApis: 3198, backend: 3199, frontend: 5174 } as const;
export const BASE_URL = `http://localhost:${PORTS.frontend}`;

/** Identifiants choisis par Nadia, l'admin, au parcours A. */
export const ADMIN = { username: 'nadia', password: 'loups-gris-admin' } as const;
/** Mot de passe définitif des joueurs, après le changement forcé. */
export const PLAYER_PASSWORD = 'mot-de-passe-joueur';
export const TEMPORARY_PASSWORD = 'temporaire-1234';

export const SHEET_ID = 'SHEET_guilde_loups_gris_0123456789';
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
export const STOCK_ITEM = 'item-stock';
