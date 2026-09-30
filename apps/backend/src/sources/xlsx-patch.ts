import { CellType, cellRef, columnNumber } from '@strategos/shared';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { CellWrite } from './source-write.service.js';

/**
 * Version de référence d'un Excel uploadé (08) : le fichier d'origine, dont les
 * cellules écrites par Strategos sont remplacées **directement dans le XML** des
 * feuilles. Tout le reste du paquet (graphiques, liaisons, mises en forme) est
 * gardé tel quel, ce qu'une réécriture complète par ExcelJS ne garantit pas.
 * Le classeur est marqué pour être entièrement recalculé à l'ouverture.
 */

const escapeXml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) attrs[m[1]!] = m[2]!;
  return attrs;
}

/** Feuille → chemin de sa partie XML dans le paquet. */
function sheetParts(files: Record<string, Uint8Array>): Map<string, string> {
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : '');
  const rels = new Map<string, string>();
  for (const m of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attributes(m[0]);
    if (a.Id && a.Target) {
      rels.set(a.Id, a.Target.startsWith('/') ? a.Target.slice(1) : `xl/${a.Target}`);
    }
  }
  const parts = new Map<string, string>();
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const a = attributes(m[0]);
    const target = rels.get(a['r:id'] ?? '');
    if (a.name && target)
      parts.set(a.name.replaceAll('&amp;', '&').replaceAll('&apos;', "'"), target);
  }
  return parts;
}

function cellXml(ref: string, style: string | undefined, w: CellWrite): string {
  const s = style ? ` s="${style}"` : '';
  // Formule saisie dans la grille : pas de valeur, Excel la calcule à l'ouverture.
  if (w.formula) return `<c r="${ref}"${s}><f>${escapeXml(w.formula)}</f></c>`;
  const value = w.value;
  switch (value.type) {
    case CellType.empty:
      return `<c r="${ref}"${s}/>`;
    case CellType.number:
    case CellType.date:
      return `<c r="${ref}"${s}><v>${value.number ?? 0}</v></c>`;
    case CellType.bool:
      return `<c r="${ref}"${s} t="b"><v>${value.number ? 1 : 0}</v></c>`;
    default:
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value.text ?? '')}</t></is></c>`;
  }
}

const ROW = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
const CELL = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const openTag = (element: string) => /^<[^>]*>/.exec(element)![0];
/** « B12 » → `{ row: 12, col: 2 }`. */
function position(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { row: Number(m[2]), col: columnNumber(m[1]!) } : null;
}

/** Remplace ou insère les cellules d'une ligne ; note les formules partagées dont la maîtresse disparaît. */
function patchRow(
  rowXml: string,
  writes: CellWrite[],
  styleAbove: (col: number) => string | undefined,
  removedShared: Set<string>,
): string {
  const tag = openTag(rowXml);
  const selfClosing = tag.endsWith('/>');
  const cells = selfClosing
    ? []
    : [...rowXml.slice(tag.length, -'</row>'.length).matchAll(CELL)].map((m) => m[0]);
  const byCol = new Map<number, string>();
  const order: number[] = [];
  for (const c of cells) {
    const col = position(attributes(openTag(c)).r ?? '')?.col ?? 0;
    byCol.set(col, c);
    order.push(col);
  }
  for (const w of writes) {
    const existing = byCol.get(w.col);
    const style = existing ? attributes(openTag(existing)).s : styleAbove(w.col);
    const shared = existing && /<f\b[^>]*t="shared"[^>]*ref="[^"]*"[^>]*>/.exec(existing);
    if (shared) removedShared.add(attributes(shared[0]).si ?? '');
    byCol.set(w.col, cellXml(cellRef({ row: w.row, col: w.col }), style, w));
    if (!existing) order.push(w.col);
  }
  const body = [...new Set(order)]
    .sort((a, b) => a - b)
    .map((col) => byCol.get(col)!)
    .join('');
  const openRow = selfClosing ? tag.replace(/\s*\/>$/, '>') : tag;
  return `${openRow}${body}</row>`;
}

function patchSheet(
  xml: string,
  sheet: string,
  writes: CellWrite[],
  formulaOf: (sheet: string, row: number, col: number) => string | undefined,
): string {
  let doc = xml.replace(/<sheetData\s*\/>/, '<sheetData></sheetData>');
  const start = doc.indexOf('<sheetData');
  const open = doc.indexOf('>', start) + 1;
  const close = doc.indexOf('</sheetData>', open);
  const rows = [...doc.slice(open, close).matchAll(ROW)].map((m) => m[0]);
  const byRow = new Map<number, string>();
  for (const r of rows) byRow.set(Number(attributes(openTag(r)).r), r);

  const writesByRow = new Map<number, CellWrite[]>();
  for (const w of writes) writesByRow.set(w.row, [...(writesByRow.get(w.row) ?? []), w]);
  const removedShared = new Set<string>();
  for (const [row, rowWrites] of [...writesByRow].sort(([a], [b]) => a - b)) {
    const above = byRow.get(row - 1);
    const styleAbove = (col: number) => {
      const cell =
        above &&
        [...above.matchAll(CELL)].find(
          (m) => attributes(openTag(m[0])).r === cellRef({ row: row - 1, col }),
        );
      return cell ? attributes(openTag(cell[0])).s : undefined;
    };
    byRow.set(
      row,
      patchRow(byRow.get(row) ?? `<row r="${row}"/>`, rowWrites, styleAbove, removedShared),
    );
  }
  let data = [...byRow]
    .sort(([a], [b]) => a - b)
    .map(([, r]) => r)
    .join('');

  // Une formule partagée dont la cellule maîtresse est écrasée : ses autres
  // cellules reçoivent leur propre formule, déjà traduite à l'import.
  if (removedShared.size > 0) {
    data = data.replace(CELL, (cell) => {
      const f = /<f\b[^>]*t="shared"[^>]*?(?:\/>|>[\s\S]*?<\/f>)/.exec(cell);
      if (!f || !removedShared.has(attributes(openTag(f[0])).si ?? '')) return cell;
      const pos = position(attributes(openTag(cell)).r ?? '');
      const formula = pos && formulaOf(sheet, pos.row, pos.col);
      return formula
        ? cell.replace(f[0], `<f>${escapeXml(formula.replace(/^=/, ''))}</f>`)
        : cell.replace(f[0], '');
    });
  }
  doc = doc.slice(0, open) + data + doc.slice(close);
  return doc;
}

/** Recalcul complet à l'ouverture : les valeurs dépendantes seront justes dans Excel. */
function fullCalcOnLoad(workbookXml: string): string {
  if (/<calcPr\b/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, attrs: string, slash: string) => {
      const cleaned = attrs.replace(/\sfullCalcOnLoad="[^"]*"/, '');
      return `<calcPr${cleaned} fullCalcOnLoad="1"${slash}>`;
    });
  }
  const after =
    /<(oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/.exec(
      workbookXml,
    );
  const at = after?.index ?? workbookXml.length;
  return `${workbookXml.slice(0, at)}<calcPr fullCalcOnLoad="1"/>${workbookXml.slice(at)}`;
}

/**
 * Applique `writes` au classeur `buffer`. `formulaOf` donne la formule (traduite)
 * d'une cellule du fichier d'origine. La chaîne de calcul est retirée : Excel la
 * reconstruit, et elle citerait sinon des formules disparues.
 */
export function patchWorkbook(
  buffer: Uint8Array,
  writes: CellWrite[],
  formulaOf: (sheet: string, row: number, col: number) => string | undefined = () => undefined,
): Buffer {
  const files = unzipSync(buffer);
  const parts = sheetParts(files);
  const bySheet = new Map<string, CellWrite[]>();
  for (const w of writes) bySheet.set(w.sheet, [...(bySheet.get(w.sheet) ?? []), w]);
  for (const [sheet, sheetWrites] of bySheet) {
    const part = parts.get(sheet);
    if (!part || !files[part]) continue;
    files[part] = strToU8(patchSheet(strFromU8(files[part]), sheet, sheetWrites, formulaOf));
  }
  if (files['xl/workbook.xml']) {
    files['xl/workbook.xml'] = strToU8(fullCalcOnLoad(strFromU8(files['xl/workbook.xml'])));
  }
  if (files['xl/calcChain.xml']) {
    delete files['xl/calcChain.xml'];
    const drop = (name: string, pattern: RegExp) => {
      if (files[name]) files[name] = strToU8(strFromU8(files[name]).replace(pattern, ''));
    };
    drop('xl/_rels/workbook.xml.rels', /<Relationship\b[^>]*calcChain[^>]*\/>/g);
    drop('[Content_Types].xml', /<Override\b[^>]*calcChain[^>]*\/>/g);
  }
  return Buffer.from(zipSync(files, { level: 6 }));
}
