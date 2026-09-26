import { type InlineCellFormat, parseCellRef } from '@strategos/shared';

/** Valeur de cellule insérée dans un Contenu libre, telle qu'enregistrée (forme canonique). */
export interface RichCell {
  sourceId: string;
  sheet: string;
  row: number;
  col: number;
  format: InlineCellFormat;
}

/** Forme produite par `sanitizeRichHtml(…, { cellValues: true })`. */
const CELL_SPAN =
  /<span data-cell-source="([^"]*)" data-cell-sheet="([^"]*)" data-cell-ref="([A-Z]+\d+)" data-cell-format="([a-z]+)">[^<]*<\/span>/g;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};
const decode = (text: string) =>
  text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (e) => ENTITIES[e]!);

function toCell(m: RegExpMatchArray): RichCell {
  const { row, col } = parseCellRef(m[3]!)!;
  return {
    sourceId: m[1]!,
    sheet: decode(m[2]!),
    row,
    col,
    format: m[4] as InlineCellFormat,
  };
}

/** Valeurs insérées d'un HTML de Contenu libre, dans l'ordre du texte. */
export function richCells(html: string): RichCell[] {
  return [...html.matchAll(CELL_SPAN)].map(toCell);
}

/**
 * Remplace chaque valeur insérée par `<span data-value="i"></span>` : ni source,
 * ni feuille, ni cellule ne sortent vers le lecteur (01 — aucun accès direct).
 */
export function replaceRichCells(html: string): string {
  let i = 0;
  return html.replace(CELL_SPAN, () => `<span data-value="${i++}"></span>`);
}
