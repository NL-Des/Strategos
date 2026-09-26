import sanitizeHtml from 'sanitize-html';

const MEDIA_SRC =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * HTML en liste blanche (06 — Contenu libre, 05 — notes) : titres, mise en forme,
 * listes, liens, tableaux simples et images de la médiathèque. Tout le reste
 * (scripts, styles, attributs d'événements, images externes) est retiré.
 */
export function sanitizeRichHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'hr',
      'blockquote',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'img' && !MEDIA_SRC.test(frame.attribs.src ?? ''),
    transformTags: {
      // Seul `target="_blank"` est gardé, toujours avec `rel="noopener noreferrer"`.
      a: (tagName, { target, rel: _rel, ...attribs }) => ({
        tagName,
        attribs: target === '_blank' ? { ...attribs, target, rel: 'noopener noreferrer' } : attribs,
      }),
    },
  });
}
