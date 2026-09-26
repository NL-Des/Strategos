import type { ThemeConfig } from '@strategos/shared';
import type { CSSProperties, ReactNode } from 'react';

/** Applique un thème par variables CSS ; tout ce qui est à l'intérieur en hérite. */
export function ThemeScope({ theme, children }: { theme: ThemeConfig; children: ReactNode }) {
  const style = {
    '--t-bg': theme.background.color,
    '--t-bg-image': theme.background.imageMediaId
      ? `url(/api/v1/media/${theme.background.imageMediaId})`
      : 'none',
    '--t-text': theme.text.color,
    '--t-heading': theme.text.headingColor,
    '--t-link': theme.text.linkColor,
    '--t-font': theme.text.fontFamily,
    '--t-surface': theme.surface.color,
    '--t-border': theme.surface.borderColor,
    '--t-radius': `${theme.surface.radius}px`,
    '--t-btn-bg': theme.buttons.background,
    '--t-btn-color': theme.buttons.color,
    '--t-btn-radius': `${theme.buttons.radius}px`,
  } as CSSProperties;
  return (
    <div className="themed" style={style}>
      {children}
    </div>
  );
}
