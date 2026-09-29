/**
 * Polices proposées aux thèmes : une liste fermée de piles de polices déjà
 * présentes sur les appareils, sans chargement externe (06 — Thèmes).
 */
export const THEME_FONTS = [
  'system',
  'humanist',
  'geometric',
  'serif',
  'old_style',
  'slab',
  'mono',
  'rounded',
] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

/** Pile CSS de chaque police. */
export const THEME_FONT_STACKS: Record<ThemeFont, string> = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  humanist:
    "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
  geometric: "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif",
  serif: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif",
  old_style: "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif",
  slab: "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  rounded:
    "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', sans-serif",
};

export const THEME_BUTTON_STYLES = ['filled', 'outline'] as const;
export type ThemeButtonStyle = (typeof THEME_BUTTON_STYLES)[number];

export const THEME_TEXT_SIZE_MIN = 14;
export const THEME_TEXT_SIZE_MAX = 20;
export const THEME_RADIUS_MAX = 32;
export const THEME_NAME_MAX_LENGTH = 100;

export interface ThemeBackground {
  color: string;
  imageMediaId: string | null;
}

export interface ThemeText {
  color: string;
  headingColor: string;
  linkColor: string;
  font: ThemeFont;
  headingFont: ThemeFont;
  /** Taille du texte courant, en pixels. */
  size: number;
}

/** Encadrés des modules (formulaires, contenus). */
export interface ThemeSurface {
  color: string;
  borderColor: string;
  radius: number;
}

export interface ThemeButtons {
  background: string;
  color: string;
  radius: number;
  style: ThemeButtonStyle;
}

export interface ThemeTables {
  headerBackground: string;
  headerColor: string;
  borderColor: string;
  stripeColor: string;
}

export interface ThemeCards {
  background: string;
  borderColor: string;
  titleColor: string;
  radius: number;
  shadow: boolean;
}

export interface ThemeDiscussions {
  background: string;
  borderColor: string;
  messageBackground: string;
  authorColor: string;
  radius: number;
}

/**
 * Contenu d'un thème (06 — Thèmes) : fond, textes, encadrés, boutons, tableaux,
 * cartes de catalogue et discussions. Les couleurs sont au format `#rrggbb`,
 * les rayons en pixels.
 */
export interface ThemeConfig {
  background: ThemeBackground;
  text: ThemeText;
  surface: ThemeSurface;
  buttons: ThemeButtons;
  tables: ThemeTables;
  cards: ThemeCards;
  discussions: ThemeDiscussions;
}

/** Thème « Sobre » de l'installation ; complète aussi un thème enregistré incomplet. */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  background: { color: '#f6f7f9', imageMediaId: null },
  text: {
    color: '#1c2330',
    headingColor: '#1c2330',
    linkColor: '#2f5bd3',
    font: 'system',
    headingFont: 'system',
    size: 16,
  },
  surface: { color: '#ffffff', borderColor: '#d9dde5', radius: 8 },
  buttons: { background: '#2f5bd3', color: '#ffffff', radius: 6, style: 'filled' },
  tables: {
    headerBackground: '#eef1f6',
    headerColor: '#1c2330',
    borderColor: '#d9dde5',
    stripeColor: '#f8f9fb',
  },
  cards: {
    background: '#ffffff',
    borderColor: '#d9dde5',
    titleColor: '#1c2330',
    radius: 8,
    shadow: false,
  },
  discussions: {
    background: '#ffffff',
    borderColor: '#d9dde5',
    messageBackground: '#f6f7f9',
    authorColor: '#2f5bd3',
    radius: 8,
  },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/**
 * Complète un thème enregistré avec les valeurs par défaut : chaque réglage
 * absent ou d'un autre type prend sa valeur par défaut ; les clés inconnues
 * sont ignorées.
 */
export function withThemeDefaults(config: unknown): ThemeConfig {
  const stored = asRecord(config);
  const merged: Record<string, Record<string, unknown>> = {};
  for (const [section, defaults] of Object.entries(DEFAULT_THEME_CONFIG)) {
    const values = asRecord(stored[section]);
    merged[section] = {};
    for (const [key, fallback] of Object.entries(defaults as Record<string, unknown>)) {
      const value = values[key];
      const sameType =
        fallback === null
          ? value === null || typeof value === 'string'
          : typeof value === typeof fallback;
      merged[section][key] = sameType ? value : fallback;
    }
  }
  return merged as unknown as ThemeConfig;
}

export interface Theme {
  id: string;
  name: string;
  config: ThemeConfig;
  version: number;
  /** Thème désigné dans les réglages de l'instance ; il ne peut pas être supprimé. */
  isDefault: boolean;
}
