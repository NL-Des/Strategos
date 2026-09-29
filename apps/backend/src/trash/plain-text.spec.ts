import { describe, expect, it } from 'vitest';
import { plainExcerpt } from './plain-text.js';

describe('plainExcerpt', () => {
  it('retire les balises et décode les entités courantes', () => {
    expect(plainExcerpt('<p>Salut <strong>Kira</strong> &amp; co</p><p>2 &lt; 3</p>')).toBe(
      'Salut Kira & co 2 < 3',
    );
  });

  it('coupe un texte trop long', () => {
    expect(plainExcerpt(`<p>${'a'.repeat(200)}</p>`, 10)).toBe(`${'a'.repeat(9)}…`);
  });
});
