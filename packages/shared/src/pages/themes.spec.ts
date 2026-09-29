import { describe, expect, it } from 'vitest';
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
});
