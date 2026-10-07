import { DEFAULT_THEME_CONFIG, type ThemeConfig, type ThemeFont } from './themes.js';

/** Couleurs d'un thème fourni ; le reste du thème en découle (`fromPalette`). */
interface Palette {
  background: string;
  surface: string;
  text: string;
  heading: string;
  /** Liens et auteurs des messages. */
  link: string;
  border: string;
  button: string;
  buttonText: string;
  tableHeader: string;
  stripe: string;
  /** Fond des messages de discussion. */
  message: string;
  headingFont?: ThemeFont;
  shadow?: boolean;
}

function fromPalette(p: Palette): ThemeConfig {
  return {
    background: { color: p.background, imageMediaId: null },
    text: {
      color: p.text,
      headingColor: p.heading,
      linkColor: p.link,
      font: 'system',
      headingFont: p.headingFont ?? 'system',
      size: 16,
    },
    surface: { color: p.surface, borderColor: p.border, radius: 8 },
    buttons: { background: p.button, color: p.buttonText, radius: 6, style: 'filled' },
    tables: {
      headerBackground: p.tableHeader,
      headerColor: p.heading,
      borderColor: p.border,
      stripeColor: p.stripe,
    },
    cards: {
      background: p.surface,
      borderColor: p.border,
      titleColor: p.heading,
      radius: 8,
      shadow: p.shadow ?? false,
    },
    discussions: {
      background: p.surface,
      borderColor: p.border,
      messageBackground: p.message,
      authorColor: p.link,
      radius: 8,
    },
  };
}

export interface ThemePreset {
  key: string;
  /** Nom du thème créé à l'installation. */
  name: string;
  /** Thème sombre : celui de `DARK_THEME_PRESET` sert au mode sombre par défaut. */
  dark: boolean;
  config: ThemeConfig;
}

/**
 * Thèmes fournis (06 — Thèmes) : créés à l'installation, et proposés comme
 * point de départ d'un nouveau thème. Les modifier ici ne change pas les thèmes
 * déjà installés : la migration `theme_presets` en garde une copie.
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  { key: 'sobre', name: 'Sobre', dark: false, config: DEFAULT_THEME_CONFIG },
  {
    key: 'ocean',
    name: 'Océan',
    dark: false,
    config: fromPalette({
      background: '#f1f6fb',
      surface: '#ffffff',
      text: '#14283d',
      heading: '#0f3d66',
      link: '#0b63b3',
      border: '#c9d8e8',
      button: '#0b63b3',
      buttonText: '#ffffff',
      tableHeader: '#dfeaf5',
      stripe: '#f5f9fd',
      message: '#f1f6fb',
      headingFont: 'humanist',
    }),
  },
  {
    key: 'foret',
    name: 'Forêt',
    dark: false,
    config: fromPalette({
      background: '#f3f7f2',
      surface: '#ffffff',
      text: '#1d2b22',
      heading: '#1f4d33',
      link: '#1f6b43',
      border: '#cddccf',
      button: '#1f6b43',
      buttonText: '#ffffff',
      tableHeader: '#e1ece2',
      stripe: '#f6faf5',
      message: '#f3f7f2',
    }),
  },
  {
    key: 'sable',
    name: 'Sable',
    dark: false,
    config: fromPalette({
      background: '#faf6ef',
      surface: '#fffdf9',
      text: '#2e261c',
      heading: '#5a3d1a',
      link: '#8a4b12',
      border: '#e3d7c3',
      button: '#8a4b12',
      buttonText: '#ffffff',
      tableHeader: '#f0e6d4',
      stripe: '#fcf8f1',
      message: '#faf6ef',
      headingFont: 'serif',
    }),
  },
  {
    key: 'prune',
    name: 'Prune',
    dark: false,
    config: fromPalette({
      background: '#f8f4f9',
      surface: '#ffffff',
      text: '#2a1f30',
      heading: '#4d2360',
      link: '#7a2f96',
      border: '#dccfe2',
      button: '#7a2f96',
      buttonText: '#ffffff',
      tableHeader: '#ecdff0',
      stripe: '#faf6fb',
      message: '#f8f4f9',
      shadow: true,
    }),
  },
  {
    key: 'sombre',
    name: 'Sombre',
    dark: true,
    config: fromPalette({
      background: '#14171c',
      surface: '#1d2128',
      text: '#e6e9ee',
      heading: '#f4f6f9',
      link: '#8ab4ff',
      border: '#343b47',
      button: '#8ab4ff',
      buttonText: '#10141a',
      tableHeader: '#262c36',
      stripe: '#191d23',
      message: '#262c36',
    }),
  },
  {
    key: 'bleu_nuit',
    name: 'Bleu nuit',
    dark: true,
    config: fromPalette({
      background: '#0e1626',
      surface: '#162036',
      text: '#dfe6f3',
      heading: '#f1f5fc',
      link: '#7cc4ff',
      border: '#2b3a57',
      button: '#6aa5ff',
      buttonText: '#0b1220',
      tableHeader: '#1e2b47',
      stripe: '#121b2e',
      message: '#1e2b47',
      headingFont: 'geometric',
    }),
  },
];

/** Thème fourni que l'installation désigne pour le mode sombre. */
export const DARK_THEME_PRESET = 'Sombre';
