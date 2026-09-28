import {
  CellType,
  DATE_PATTERN,
  FIELD_MAX_LENGTH,
  type FormDefinition,
  type FormField,
  type FormMode,
  columnNumber,
  parseCellRef,
  type SubmissionValue,
  type SubmissionValues,
} from '@strategos/shared';
import { excelSerial } from '../sources/excel-parser.js';
import type { StoredCell } from '../sources/cell-format.js';
import type { CellAddress, StoredValue } from '../sources/source-write.service.js';

/**
 * Règles pures des formulaires (09) : configuration, périmètre d'écriture,
 * changements structurels, conflits et validation des valeurs soumises.
 */

type Fields = Record<string, string[]>;

/** Champs que l'utilisateur remplit (les champs automatiques le sont par le serveur). */
export const userFields = (def: FormDefinition) => def.fields.filter((f) => !f.auto);

/**
 * Erreurs de cohérence d'une définition, par chemin (`VALIDATION_FAILED`). Un
 * mapping incomplet n'en est pas une : le formulaire reste « non configuré ».
 */
export function definitionErrors(mode: FormMode, def: FormDefinition): Fields {
  const fields: Fields = {};
  const fail = (path: string, reason: string) => (fields[path] ??= []).push(reason);
  const keys = new Set<string>();
  def.fields.forEach((f, i) => {
    const path = `definition.fields[${i}]`;
    if (keys.has(f.key)) fail(`${path}.key`, 'duplicateId');
    keys.add(f.key);
    if (mode === 'modification' && f.col !== undefined) fail(`${path}.col`, 'notAllowed');
    if (mode !== 'modification' && f.cell !== undefined) fail(`${path}.cell`, 'notAllowed');
    if (f.movement && (f.type !== 'number' || f.auto)) fail(`${path}.movement`, 'notAllowed');
    if (f.movement && mode === 'ajout') fail(`${path}.movement`, 'notAllowed');
    if (f.auto === 'pseudo' && f.type !== 'text') fail(`${path}.auto`, 'notAllowed');
    if (f.auto === 'date' && f.type !== 'date') fail(`${path}.auto`, 'notAllowed');
    if (f.options && f.type !== 'select') fail(`${path}.options`, 'notAllowed');
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) fail(`${path}.max`, 'min');
    if (f.minDate && f.maxDate && f.minDate > f.maxDate) fail(`${path}.maxDate`, 'min');
  });
  if (mode !== 'ligne') {
    for (const key of ['rowStart', 'rowEnd', 'keyCol', 'linkedBlockId'] as const) {
      if (def[key] !== undefined && def[key] !== null) fail(`definition.${key}`, 'notAllowed');
    }
  }
  if (mode !== 'ajout') {
    for (const key of ['startRow', 'maxNewRows'] as const) {
      if (def[key] !== undefined) fail(`definition.${key}`, 'notAllowed');
    }
  }
  if (mode === 'ligne' && def.rowStart && def.rowEnd && def.rowEnd < def.rowStart) {
    fail('definition.rowEnd', 'min');
  }
  return fields;
}

function optionsConfigured(f: FormField): boolean {
  if (f.type !== 'select') return true;
  if (f.options?.kind === 'list') return (f.options.values ?? []).length > 0;
  return !!(f.options?.sourceId && f.options.sheet && f.options.range);
}

/** Mapping complet : un formulaire non configuré n'est pas affiché (09). */
export function isConfigured(mode: FormMode, def: FormDefinition): boolean {
  if (!def.sourceId || !def.sheet || def.fields.length === 0) return false;
  if (Object.keys(definitionErrors(mode, def)).length > 0) return false;
  const mapped = def.fields.every((f) => (mode === 'modification' ? !!f.cell : !!f.col));
  if (!mapped || !def.fields.every(optionsConfigured)) return false;
  if (mode === 'ligne') return !!(def.keyCol && def.linkedBlockId && def.rowStart);
  if (mode === 'ajout') return !!(def.startRow && def.maxNewRows);
  return true;
}

/** Zone d'ajout : `[startRow, startRow + maxNewRows - 1]`. */
export function addZone(def: FormDefinition): { top: number; bottom: number } {
  const top = def.startRow ?? 1;
  return { top, bottom: top + (def.maxNewRows ?? 1) - 1 };
}

/** Colonnes mappées (formulaires de ligne et d'ajout). */
export const mappedColumns = (def: FormDefinition): number[] => [
  ...new Set(def.fields.flatMap((f) => (f.col ? [columnNumber(f.col)] : []))),
];

/** Cellule visée par un champ ; `row` : ligne retrouvée (ligne) ou attribuée (ajout). */
export function fieldTarget(def: FormDefinition, field: FormField, row?: number): CellAddress {
  if (field.cell) {
    const pos = parseCellRef(field.cell)!;
    return { sheet: def.sheet!, row: pos.row, col: pos.col };
  }
  return { sheet: def.sheet!, row: row!, col: columnNumber(field.col!) };
}

/**
 * Périmètre d'écriture défini par l'admin (09 — Sécurité) : cellule d'un champ,
 * colonne mappée sur la plage de lignes, ou colonne mappée dans la zone d'ajout.
 */
export function inPerimeter(
  mode: FormMode,
  def: FormDefinition,
  field: FormField,
  target: CellAddress,
): boolean {
  if (target.sheet !== def.sheet) return false;
  if (mode === 'modification') {
    const pos = field.cell ? parseCellRef(field.cell) : null;
    return !!pos && pos.row === target.row && pos.col === target.col;
  }
  if (!field.col || columnNumber(field.col) !== target.col) return false;
  if (mode === 'ajout') {
    const zone = addZone(def);
    return target.row >= zone.top && target.row <= zone.bottom;
  }
  return target.row >= (def.rowStart ?? 1) && (!def.rowEnd || target.row <= def.rowEnd);
}

/**
 * Modification structurelle (09) : elle invalide les soumissions en attente à
 * la publication. Libellés, aides, ordre, options et règles n'en sont pas.
 */
export function structuralChange(prev: FormDefinition, next: FormDefinition): boolean {
  if (prev.sourceId !== next.sourceId || prev.sheet !== next.sheet) return true;
  if (prev.keyCol !== next.keyCol) return true;
  if (prev.startRow !== next.startRow || prev.maxNewRows !== next.maxNewRows) return true;
  if (prev.fields.length !== next.fields.length) return true;
  const before = new Map(prev.fields.map((f) => [f.key, f]));
  return next.fields.some((f) => {
    const p = before.get(f.key);
    return (
      !p ||
      p.type !== f.type ||
      !!p.movement !== !!f.movement ||
      (p.cell ?? null) !== (f.cell ?? null) ||
      (p.col ?? null) !== (f.col ?? null)
    );
  });
}

/**
 * Cellules visées, calculées à la soumission pour détecter les conflits :
 * `source:feuille:r5:c4`, ou `source:feuille:key=137:c4` pour un formulaire de
 * ligne. Les mouvements s'additionnent et les ajouts créent des lignes : ils ne
 * sont jamais en conflit ; un champ laissé vide n'écrit rien.
 */
export function conflictKeys(
  mode: FormMode,
  def: FormDefinition,
  rowKey: string | null,
  values?: SubmissionValues,
): string[] {
  if (mode === 'ajout') return [];
  const base = `${def.sourceId}:${def.sheet}`;
  return def.fields
    .filter((f) => !f.movement && (!values || (values[f.key] ?? null) !== null))
    .map((f) => {
      if (mode === 'ligne') {
        return `${base}:key=${encodeURIComponent(rowKey ?? '')}:c${columnNumber(f.col!)}`;
      }
      const pos = parseCellRef(f.cell!)!;
      return `${base}:r${pos.row}:c${pos.col}`;
    });
}

/** « 2026-02-30 » est refusée : la date doit exister. */
function isValidDate(s: string): boolean {
  if (!DATE_PATTERN.test(s)) return false;
  const date = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(s);
}

/** Valeur d'un champ automatique. */
export function autoValue(field: FormField, username: string, now: Date): SubmissionValue {
  return field.auto === 'pseudo' ? username : now.toISOString().slice(0, 10);
}

/**
 * Valeurs d'une soumission : les champs automatiques sont remplis par le
 * serveur (toute valeur envoyée est ignorée), les autres sont vérifiés selon
 * leurs règles. Les clés inconnues sont ignorées.
 */
export function validateValues(
  def: FormDefinition,
  input: SubmissionValues,
  context: { username: string; now: Date; options: Map<string, string[]> },
): { values: SubmissionValues; fields: Fields } {
  const values: SubmissionValues = {};
  const fields: Fields = {};
  const fail = (key: string, reason: string) => (fields[`values.${key}`] ??= []).push(reason);
  for (const f of def.fields) {
    if (f.auto) {
      values[f.key] = autoValue(f, context.username, context.now);
      continue;
    }
    let v: SubmissionValue = input[f.key] ?? null;
    if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    if (v === null) {
      if (f.type === 'checkbox') v = false;
      else {
        if (f.required) fail(f.key, 'isDefined');
        values[f.key] = null;
        continue;
      }
    }
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'select': {
        if (typeof v !== 'string') {
          fail(f.key, 'invalid');
          break;
        }
        if (v.length > (f.maxLength ?? FIELD_MAX_LENGTH)) fail(f.key, 'maxLength');
        if (f.type === 'select' && !(context.options.get(f.key) ?? []).includes(v)) {
          fail(f.key, 'isIn');
        }
        break;
      }
      case 'number': {
        if (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v)) v = Number(v.replace(',', '.'));
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          fail(f.key, 'invalid');
          break;
        }
        if (f.min !== undefined && v < f.min) fail(f.key, 'min');
        if (f.max !== undefined && v > f.max) fail(f.key, 'max');
        break;
      }
      case 'date': {
        if (typeof v !== 'string' || !isValidDate(v)) {
          fail(f.key, 'invalid');
          break;
        }
        if (f.minDate && v < f.minDate) fail(f.key, 'min');
        if (f.maxDate && v > f.maxDate) fail(f.key, 'max');
        break;
      }
      case 'checkbox': {
        if (typeof v !== 'boolean') fail(f.key, 'invalid');
        else if (f.required && !v) fail(f.key, 'isDefined');
        break;
      }
    }
    values[f.key] = v;
  }
  return { values, fields };
}

/** Valeur brute écrite dans la cellule, selon le type du champ. */
export function toStoredValue(field: FormField, value: SubmissionValue): StoredValue {
  if (value === null || value === '') return { type: CellType.empty, text: null, number: null };
  if (field.type === 'checkbox' || typeof value === 'boolean') {
    const on = value === true;
    return { type: CellType.bool, text: on ? 'VRAI' : 'FAUX', number: on ? 1 : 0 };
  }
  if (field.type === 'number' && typeof value === 'number') {
    return { type: CellType.number, text: String(value), number: value };
  }
  if (field.type === 'date' && typeof value === 'string') {
    const serial = excelSerial(new Date(`${value}T00:00:00Z`));
    return { type: CellType.date, text: value, number: serial };
  }
  return { type: CellType.text, text: String(value), number: null };
}

/** Valeur actuelle d'une cellule, pour pré-remplir un champ (formulaire de ligne). */
export function prefillValue(field: FormField, cell: StoredCell): SubmissionValue {
  if (field.auto || field.movement || cell.type === CellType.empty) return null;
  switch (field.type) {
    case 'number':
      return cell.number !== null && cell.type !== CellType.bool ? cell.number : null;
    case 'checkbox':
      return cell.type === CellType.bool ? cell.number === 1 : null;
    case 'date':
      return cell.type === CellType.date && cell.text ? cell.text.slice(0, 10) : null;
    default:
      return cell.text;
  }
}

/** Texte d'une valeur écrite (journal, réimport). */
export const storedText = (v: { type: CellType; text: string | null }): string | null =>
  v.type === CellType.empty ? null : v.text;
