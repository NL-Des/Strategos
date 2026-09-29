import { sanitizeNoteHtml, sanitizeRichHtml } from './html-sanitizer.js';

const MEDIA = '/api/v1/media/0190f5c0-0000-7000-8000-000000000001';

describe('sanitizeRichHtml', () => {
  it('garde la mise en forme autorisée', () => {
    const html =
      '<h2>Titre</h2><p><strong>gras</strong> <em>it</em></p><ul><li>a</li></ul>' +
      '<table><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it('retire scripts, styles et attributs d’événements', () => {
    const out = sanitizeRichHtml(
      '<p style="color:red" onclick="x()">ok</p><script>alert(1)</script><iframe src="x"></iframe>',
    );
    expect(out).toBe('<p>ok</p>');
  });

  it('refuse les liens javascript: et protège les liens externes ouverts à part', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichHtml('<a href="/pages/x" target="_top" rel="opener">x</a>')).toBe(
      '<a href="/pages/x">x</a>',
    );
    expect(sanitizeRichHtml('<a href="https://ex.org" target="_blank">x</a>')).toBe(
      '<a href="https://ex.org" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('n’accepte que les images de la médiathèque', () => {
    expect(sanitizeRichHtml(`<img src="${MEDIA}" alt="épée" />`)).toBe(
      `<img src="${MEDIA}" alt="épée" />`,
    );
    expect(sanitizeRichHtml('<img src="https://evil.example/x.png" />')).toBe('');
    expect(sanitizeRichHtml('<img src="data:image/png;base64,AAA" />')).toBe('');
  });
});

describe('sanitizeNoteHtml', () => {
  it('garde la mise en forme simple : gras, italique, listes, liens', () => {
    const html =
      '<p><strong>Tank</strong> <em>devant</em></p><ul><li>un</li></ul><ol><li>deux</li></ol>' +
      '<p><a href="https://ex.org" target="_blank">lien</a></p>';
    expect(sanitizeNoteHtml(html)).toBe(
      html.replace('target="_blank"', 'target="_blank" rel="noopener noreferrer"'),
    );
  });

  it('retire images, titres, tableaux, scripts et liens dangereux', () => {
    expect(sanitizeNoteHtml(`<h2>Titre</h2><img src="${MEDIA}" />`)).toBe('Titre');
    expect(sanitizeNoteHtml('<table><tr><td>x</td></tr></table>')).toBe('x');
    expect(sanitizeNoteHtml('<p onclick="x()">a<script>alert(1)</script></p>')).toBe('<p>a</p>');
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });
});
