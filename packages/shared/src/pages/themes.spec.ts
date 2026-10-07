import { describe, expect, it } from 'vitest';
import { DARK_THEME_PRESET, THEME_PRESETS } from './theme-presets.js';
import {
  DEFAULT_THEME_CONFIG,
  THEME_FONT_STACKS,
  THEME_FONTS,
  withThemeDefaults,
} from './themes.js';

describe('thèmes', () => {
  it('complète un thème incomplet et ignore les réglages inconnus ou mal typés', () => {
    const theme = withThemeDefaults({
      background: { color: '#000000' },
      text: { fontFamily: 'Arial', size: '18', color: '#ffffff' },
      extra: { x: 1 },
    });
    expect(theme.background).toEqual({ color: '#000000', imageMediaId: null });
    expect(theme.text).toEqual({ ...DEFAULT_THEME_CONFIG.text, color: '#ffffff' });
    expect(theme.discussions).toEqual(DEFAULT_THEME_CONFIG.discussions);
    expect(Object.keys(theme)).toEqual(Object.keys(DEFAULT_THEME_CONFIG));
    expect(withThemeDefaults(null)).toEqual(DEFAULT_THEME_CONFIG);
  });

  it('chaque police a sa pile CSS', () => {
    expect(Object.keys(THEME_FONT_STACKS).sort()).toEqual([...THEME_FONTS].sort());
  });

  describe('thèmes fournis', () => {
    /** Luminance relative et rapport de contraste (WCAG 2). */
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };

    it('clés et noms uniques, « Sobre » en tête, thème du mode sombre présent', () => {
      expect(new Set(THEME_PRESETS.map((p) => p.key)).size).toBe(THEME_PRESETS.length);
      expect(new Set(THEME_PRESETS.map((p) => p.name)).size).toBe(THEME_PRESETS.length);
      expect(THEME_PRESETS[0]!.config).toBe(DEFAULT_THEME_CONFIG);
      expect(THEME_PRESETS.find((p) => p.name === DARK_THEME_PRESET)?.dark).toBe(true);
    });

    it.each(THEME_PRESETS.map((p) => [p.name, p] as const))('%s : complet', (_name, preset) => {
      expect(withThemeDefaults(preset.config)).toEqual(preset.config);
    });

    it.each(THEME_PRESETS.map((p) => [p.name, p] as const))(
      '%s : textes lisibles (contraste 4,5:1 au moins)',
      (_name, { config: c, dark }) => {
        const pairs: [string, string][] = [
          [c.text.color, c.background.color],
          [c.text.color, c.surface.color],
          [c.text.headingColor, c.background.color],
          [c.text.headingColor, c.surface.color],
          [c.text.linkColor, c.background.color],
          [c.text.linkColor, c.surface.color],
          [c.buttons.color, c.buttons.background],
          [c.tables.headerColor, c.tables.headerBackground],
          [c.text.color, c.tables.stripeColor],
          [c.cards.titleColor, c.cards.background],
          [c.text.color, c.discussions.messageBackground],
          [c.discussions.authorColor, c.discussions.messageBackground],
        ];
        for (const [fg, bg] of pairs) {
          expect(contrast(fg, bg), `${fg} sur ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(luminance(c.background.color) < 0.2).toBe(dark);
      },
    );
  });
});
