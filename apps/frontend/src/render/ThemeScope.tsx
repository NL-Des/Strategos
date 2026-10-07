import { THEME_FONT_STACKS, type ThemeConfig } from '@strategos/shared';
import type { CSSProperties, ReactNode } from 'react';

const font = (key: string) =>
  THEME_FONT_STACKS[key as keyof typeof THEME_FONT_STACKS] ?? THEME_FONT_STACKS.system;

/** Fond sombre : les champs et barres de défilement du navigateur suivent. */
function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 128;
}

/**
 * Applique un thème (06 — Thèmes) par variables CSS ; tout ce qui est à
 * l'intérieur en hérite : fond, textes, encadrés, boutons, tableaux, cartes et
 * discussions.
 */
export function ThemeScope({
  theme,
  className = '',
  children,
}: {
  theme: ThemeConfig;
  className?: string;
  children: ReactNode;
}) {
  const { background, text, surface, buttons, tables, cards, discussions } = theme;
  const style = {
    '--t-bg': background.color,
    '--t-bg-image': background.imageMediaId
      ? `url(/api/v1/media/${background.imageMediaId})`
      : 'none',
    '--t-text': text.color,
    '--t-heading': text.headingColor,
    '--t-link': text.linkColor,
    '--t-font': font(text.font),
    '--t-heading-font': font(text.headingFont),
    // En `rem` : la taille du thème suit le réglage de taille de texte du navigateur.
    '--t-size': `${text.size / 16}rem`,
    '--t-surface': surface.color,
    '--t-border': surface.borderColor,
    '--t-radius': `${surface.radius}px`,
    '--t-btn-bg': buttons.style === 'outline' ? 'transparent' : buttons.background,
    '--t-btn-color': buttons.style === 'outline' ? buttons.background : buttons.color,
    '--t-btn-border': buttons.background,
    '--t-btn-radius': `${buttons.radius}px`,
    '--t-table-head-bg': tables.headerBackground,
    '--t-table-head-color': tables.headerColor,
    '--t-table-border': tables.borderColor,
    '--t-table-stripe': tables.stripeColor,
    '--t-card-bg': cards.background,
    '--t-card-border': cards.borderColor,
    '--t-card-title': cards.titleColor,
    '--t-card-radius': `${cards.radius}px`,
    '--t-card-shadow': cards.shadow ? 'var(--shadow-md)' : 'none',
    '--t-disc-bg': discussions.background,
    '--t-disc-border': discussions.borderColor,
    '--t-disc-msg-bg': discussions.messageBackground,
    '--t-disc-author': discussions.authorColor,
    '--t-disc-radius': `${discussions.radius}px`,
    colorScheme: isDark(background.color) ? 'dark' : 'light',
  } as CSSProperties;
  return (
    <div className={`themed ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
