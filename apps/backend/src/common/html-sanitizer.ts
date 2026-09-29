import { CELL_REF_PATTERN, INLINE_CELL_FORMATS } from '@strategos/shared';
import sanitizeHtml from 'sanitize-html';

const MEDIA_SRC =
  /^\/api\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const normalizeRef = (ref: string) => ref.replaceAll('$', '').toUpperCase();

// Seul `target="_blank"` est gardé, toujours avec `rel="noopener noreferrer"`.
const safeLink: sanitizeHtml.Transformer = (tagName, { target, rel: _rel, ...attribs }) => ({
  tagName,
  attribs: target === '_blank' ? { ...attribs, target, rel: 'noopener noreferrer' } : attribs,
});

/** Valeur de cellule insérée dans un Contenu libre (06) : attributs attendus et valides. */
function isCellValue(attribs: Record<string, string>): boolean {
  return (
    UUID.test((attribs['data-cell-source'] ?? '').toLowerCase()) &&
    !!attribs['data-cell-sheet'] &&
    attribs['data-cell-sheet'].length <= 100 &&
    CELL_REF_PATTERN.test(normalizeRef(attribs['data-cell-ref'] ?? '')) &&
    (INLINE_CELL_FORMATS as readonly string[]).includes(attribs['data-cell-format'] ?? '')
  );
}

/**
 * HTML en liste blanche (06 — Contenu libre, 05 — notes) : titres, mise en forme,
 * listes, liens, tableaux simples et images de la médiathèque. Tout le reste
 * (scripts, styles, attributs d'événements, images externes) est retiré.
 *
 * Avec `cellValues` (Contenu libre seulement), les valeurs de cellules insérées
 * sont gardées sous une forme canonique, que l'assemblage de la page résout :
 * `<span data-cell-source data-cell-sheet data-cell-ref data-cell-format>{Feuille!B2}</span>`.
 */
export function sanitizeRichHtml(html: string, { cellValues = false } = {}): string {
  const clean = sanitizeHtml(html, {
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
      ...(cellValues ? ['span'] : []),
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      span: ['data-cell-source', 'data-cell-sheet', 'data-cell-ref', 'data-cell-format'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'img' && !MEDIA_SRC.test(frame.attribs.src ?? ''),
    transformTags: {
      // Un `<span>` qui n'est pas une valeur de cellule valide est retiré, son texte gardé.
      span: (tagName, attribs) => {
        if (!cellValues || !isCellValue(attribs)) {
          return { tagName: 'strategos-drop', attribs: {} as Record<string, string> };
        }
        const ref = normalizeRef(attribs['data-cell-ref']!);
        const sheet = attribs['data-cell-sheet']!;
        return {
          tagName,
          attribs: {
            'data-cell-source': attribs['data-cell-source']!.toLowerCase(),
            'data-cell-sheet': sheet,
            'data-cell-ref': ref,
            'data-cell-format': attribs['data-cell-format']!,
          },
          text: `{${sheet}!${ref}}`,
        };
      },
      a: safeLink,
    },
  });
  // Une valeur de cellule ne contient que son libellé : balises imbriquées retirées.
  return clean.replace(
    /(<span data-cell-source="[^"]*"[^>]*>)(\{[^<]*\})[\s\S]*?<\/span>/g,
    '$1$2</span>',
  );
}

/**
 * HTML d'une note personnelle (05) : mise en forme simple (gras, italique,
 * listes, liens). Ni images, ni titres, ni tableaux ; le reste est retiré.
 */
export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    transformTags: { a: safeLink },
  });
}
