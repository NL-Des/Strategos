/**
 * Contenu d'un thème (06 — Thèmes). Le thème par défaut est créé à l'installation ;
 * l'éditeur de thèmes et les réglages complets (discussions, tableaux, cartes)
 * arrivent à l'étape 11.
 */
export interface ThemeConfig {
  background: { color: string; imageMediaId: string | null };
  text: { color: string; headingColor: string; linkColor: string; fontFamily: string };
  surface: { color: string; borderColor: string; radius: number };
  buttons: { background: string; color: string; radius: number };
}

export interface Theme {
  id: string;
  name: string;
  config: ThemeConfig;
  version: number;
}
