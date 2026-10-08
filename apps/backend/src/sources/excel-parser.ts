import { CellType } from '@strategos/shared';
import ExcelJS from 'exceljs';
import { strFromU8, Unzip, UnzipInflate, unzipSync } from 'fflate';
import { config } from '../config.js';

/**
 * Lecture d'un classeur `.xlsx` pour le staging (08). Aucune formule n'est
 * évaluée : on garde le texte de la formule et la **valeur stockée** par Excel
 * lors du dernier calcul.
 */

export interface ParsedCell {
  row: number;
  col: number;
  type: CellType;
  text: string | null;
  number: number | null;
  formula: string | null;
}

export interface ParsedWorkbook {
  sheets: { name: string; cells: ParsedCell[] }[];
  /** Classeurs liés : indice `[n]` des formules → nom du fichier (sans chemin). */
  externalBooks: Map<number, string>;
}

export class ExcelParseError extends Error {}
/** Classeur refusé avant lecture : trop volumineux une fois décompressé. */
export class WorkbookTooLargeError extends ExcelParseError {}

const INFLATE_SLICE_BYTES = 64 * 1024;

/**
 * Vrai si le paquet `.xlsx`, une fois décompressé, dépasse `maxBytes`. Un
 * classeur de quelques Mo peut en occuper plusieurs Go : ExcelJS le décompresse
 * en entier en mémoire, donc on mesure avant de le lui confier. Les tailles
 * annoncées dans l'archive ne sont pas crues : chaque partie est réellement
 * décompressée, par tranches, et l'on s'arrête dès le dépassement.
 */
export function exceedsUncompressedSize(buffer: Uint8Array, maxBytes: number): boolean {
  let total = 0;
  let exceeded = false;
  const unzip = new Unzip((file) => {
    file.ondata = (error, chunk) => {
      if (error) throw error;
      total += chunk.length;
      if (total > maxBytes) {
        exceeded = true;
        file.terminate();
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < buffer.length && !exceeded; offset += INFLATE_SLICE_BYTES) {
    const end = Math.min(offset + INFLATE_SLICE_BYTES, buffer.length);
    unzip.push(buffer.subarray(offset, end), end === buffer.length);
  }
  return exceeded;
}

/** Numéro de série Excel d'une date (jours depuis le 30/12/1899), pour les tris. */
export function excelSerial(date: Date): number {
  return date.getTime() / 86_400_000 + 25_569;
}

/** Date lisible et triable : « 2026-09-26 », ou « 2026-09-26T14:30 » avec une heure. */
export function dateText(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16);
}

type Stored = Pick<ParsedCell, 'type' | 'text' | 'number'>;

/** Valeur (ou résultat stocké d'une formule) → valeur typée du staging. */
function storedValue(value: unknown): Stored {
  if (value === null || value === undefined || value === '') {
    return { type: CellType.empty, text: null, number: null };
  }
  if (typeof value === 'number') {
    return { type: CellType.number, text: String(value), number: value };
  }
  if (typeof value === 'boolean') {
    return { type: CellType.bool, text: value ? 'VRAI' : 'FAUX', number: value ? 1 : 0 };
  }
  if (typeof value === 'string') return { type: CellType.text, text: value, number: null };
  if (value instanceof Date) {
    return { type: CellType.date, text: dateText(value), number: excelSerial(value) };
  }
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      const text = (v.richText as { text: string }[]).map((r) => r.text).join('');
      return { type: CellType.text, text, number: null };
    }
    if (typeof v.error === 'string') return { type: CellType.error, text: v.error, number: null };
    if ('hyperlink' in v) return storedValue(v.text);
    if ('formula' in v || 'sharedFormula' in v) return storedValue(v.result);
  }
  return { type: CellType.text, text: String(value), number: null };
}

/** Attributs d'une balise XML simple (`<Relationship Id="…" Target="…"/>`). */
function attributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) {
    attrs[m[1]!.replace(/^\w+:/, '')] = m[2]!;
  }
  return attrs;
}

function relationships(xml: string | undefined): Map<string, string> {
  const rels = new Map<string, string>();
  for (const m of (xml ?? '').matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const a = attributes(m[0]);
    if (a.Id && a.Target) rels.set(a.Id, a.Target);
  }
  return rels;
}

/** Dernier segment d'un chemin Windows, POSIX ou `file:///`. */
function fileBasename(target: string): string {
  let path = target;
  try {
    path = decodeURIComponent(target);
  } catch {
    // Chemin non encodé : gardé tel quel.
  }
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Classeurs liés, dans l'ordre de `<externalReferences>` : c'est cet ordre qui
 * donne l'indice `[1]`, `[2]`… des formules. ExcelJS ne les expose pas : on lit
 * directement les parties du paquet `.xlsx`.
 */
export function readExternalBooks(buffer: Uint8Array): Map<number, string> {
  const files = unzipSync(buffer, {
    filter: (f) =>
      f.name === 'xl/workbook.xml' ||
      f.name === 'xl/_rels/workbook.xml.rels' ||
      f.name.startsWith('xl/externalLinks/_rels/'),
  });
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : undefined);
  const workbookRels = relationships(text('xl/_rels/workbook.xml.rels'));
  const books = new Map<number, string>();
  const refs = [
    ...(text('xl/workbook.xml') ?? '').matchAll(/<(?:\w+:)?externalReference\b[^>]*>/g),
  ];
  refs.forEach((m, i) => {
    const partTarget = workbookRels.get(attributes(m[0]).id ?? '');
    if (!partTarget) return;
    const part = partTarget
      .replace(/^\/?(xl\/)?/, '')
      .split('/')
      .pop()!;
    const linkRels = relationships(text(`xl/externalLinks/_rels/${part}.rels`));
    const target = [...linkRels.values()][0];
    if (target) books.set(i + 1, fileBasename(target));
  });
  return books;
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  let tooLarge: boolean;
  try {
    tooLarge = exceedsUncompressedSize(buffer, config.xlsxMaxUncompressedBytes);
  } catch (error) {
    throw new ExcelParseError(String(error));
  }
  if (tooLarge) throw new WorkbookTooLargeError('classeur trop volumineux une fois décompressé');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new ExcelParseError(String(error));
  }
  const sheets = workbook.worksheets.map((ws) => {
    const cells: ParsedCell[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const stored = storedValue(cell.value);
        const formula = cell.formula || null;
        if (stored.type === CellType.empty && !formula) return;
        cells.push({ row: Number(cell.row), col: Number(cell.col), ...stored, formula });
      });
    });
    return { name: ws.name, cells };
  });
  let externalBooks = new Map<number, string>();
  try {
    externalBooks = readExternalBooks(buffer);
  } catch {
    // Paquet déjà lu par ExcelJS : une partie de liaison illisible n'empêche pas l'import.
  }
  return { sheets, externalBooks };
}

/** Référence vers un autre classeur trouvée dans une formule. */
export interface ExternalRef {
  book: number;
  sheet: string;
  /** Plage sans `$` : « B2 » ou « B2:B40 ». */
  range: string;
}

const CELL = String.raw`\$?[A-Z]{1,3}\$?\d+`;
const EXTERNAL = String.raw`(?:'\[(\d+)\]((?:[^']|'')+)'|\[(\d+)\]([^!'\[\]()\s,;+\-*/^&=<>]+))!(${CELL}(?::${CELL})?)`;

function toRef(m: RegExpMatchArray): ExternalRef {
  return {
    book: Number(m[1] ?? m[3]),
    sheet: (m[2] ?? m[4]!).replaceAll("''", "'"),
    range: m[5]!.replaceAll('$', ''),
  };
}

/** Toutes les références externes d'une formule (pour `cell_references`). */
export function externalRefs(formula: string): ExternalRef[] {
  return [...formula.matchAll(new RegExp(EXTERNAL, 'g'))].map(toRef);
}

/**
 * La formule n'est **que** la référence à une cellule d'un autre classeur
 * (`=[1]Stock!B2`) : sa valeur se lit alors dans la source liée. Toute autre
 * formule garde sa valeur stockée, puisque Strategos ne calcule rien.
 */
export function pureExternalRef(formula: string): ExternalRef | null {
  const m = new RegExp(`^=?${EXTERNAL}$`).exec(formula.trim());
  if (!m) return null;
  const ref = toRef(m);
  return ref.range.includes(':') ? null : ref;
}
