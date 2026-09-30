import { type FormulaFunction, functionByFrName, functionByStoredName } from './functions.js';
import { type FormulaLocale, type RefInfo, type Token, tokenize } from './tokenize.js';

/**
 * Arbre d'une formule (04 — Sources, panneau de la grille) : sa structure,
 * pour la lire et l'écrire, jamais pour la calculer. Positions relatives à la
 * formule sans « = ». Une formule incomplète donne un arbre partiel (nœuds
 * `missing`) et des erreurs, pas une exception.
 */
interface Span {
  start: number;
  end: number;
}

export type FormulaNode = Span &
  (
    | {
        kind: 'call';
        name: string;
        fn: FormulaFunction | undefined;
        args: FormulaNode[];
        closed: boolean;
      }
    | { kind: 'binary'; op: string; left: FormulaNode; right: FormulaNode }
    | { kind: 'unary'; op: string; operand: FormulaNode }
    | { kind: 'percent'; operand: FormulaNode }
    | { kind: 'group'; inner: FormulaNode; closed: boolean }
    | { kind: 'ref'; text: string; ref: RefInfo }
    | { kind: 'number' | 'string' | 'bool' | 'error' | 'name' | 'array'; text: string }
    /** Argument laissé vide : `SI(A1;;0)`. */
    | { kind: 'empty' }
    /** Opérande attendu mais absent (saisie en cours ou erreur). */
    | { kind: 'missing' }
  );

export type FormulaSyntaxError = 'unclosed' | 'unexpected' | 'missing';

export interface ParsedFormula {
  tokens: Token[];
  root: FormulaNode;
  errors: { error: FormulaSyntaxError; at: number }[];
}

const BINARY: Record<string, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '<=': 1,
  '>': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};
const UNARY = 6;

export function lookupFunction(name: string, locale: FormulaLocale): FormulaFunction | undefined {
  return locale === 'fr' ? functionByFrName(name) : functionByStoredName(name);
}

export function parseFormula(formula: string, locale: FormulaLocale): ParsedFormula {
  const tokens = tokenize(formula, locale);
  const list = tokens.filter((t) => t.type !== 'space');
  const errors: ParsedFormula['errors'] = [];
  let i = 0;
  const peek = () => list[i];
  const at = () => peek()?.start ?? formula.length;
  const missing = (): FormulaNode => {
    errors.push({ error: 'missing', at: at() });
    return { kind: 'missing', start: at(), end: at() };
  };

  const primary = (): FormulaNode => {
    const t = peek();
    if (!t) return missing();
    switch (t.type) {
      case 'op':
        if (t.text === '-' || t.text === '+') {
          i++;
          const operand = expression(UNARY);
          return { kind: 'unary', op: t.text, operand, start: t.start, end: operand.end };
        }
        return missing();
      case 'number':
      case 'string':
      case 'bool':
      case 'error':
      case 'name':
        i++;
        return { kind: t.type, text: t.text, start: t.start, end: t.end };
      case 'ref':
        i++;
        return { kind: 'ref', text: t.text, ref: t.ref!, start: t.start, end: t.end };
      case 'arrayOpen': {
        while (peek() && peek()!.type !== 'arrayClose') i++;
        const close = peek();
        if (close) i++;
        else errors.push({ error: 'unclosed', at: t.start });
        const end = close?.end ?? formula.length;
        return { kind: 'array', text: formula.slice(t.start, end), start: t.start, end };
      }
      case 'open': {
        i++;
        const inner = expression(0);
        const closed = peek()?.type === 'close';
        if (closed) i++;
        else errors.push({ error: 'unclosed', at: t.start });
        const end = closed ? list[i - 1]!.end : Math.max(inner.end, t.end);
        return { kind: 'group', inner, closed, start: t.start, end };
      }
      case 'func':
        return call(t);
      default:
        return missing();
    }
  };

  const call = (t: Token): FormulaNode => {
    i += 2; // nom et « ( »
    const args: FormulaNode[] = [];
    const empty = (): FormulaNode => ({ kind: 'empty', start: at(), end: at() });
    if (peek()?.type !== 'close' && peek()) {
      for (;;) {
        const next = peek();
        args.push(!next || next.type === 'sep' || next.type === 'close' ? empty() : expression(0));
        if (peek()?.type !== 'sep') break;
        i++;
      }
    }
    const closed = peek()?.type === 'close';
    if (closed) i++;
    else errors.push({ error: 'unclosed', at: t.start });
    const end = closed ? list[i - 1]!.end : Math.max(t.end + 1, args.at(-1)?.end ?? 0);
    return {
      kind: 'call',
      name: t.text,
      fn: lookupFunction(t.text, locale),
      args,
      closed,
      start: t.start,
      end,
    };
  };

  function expression(min: number): FormulaNode {
    let left = primary();
    for (;;) {
      const t = peek();
      if (t?.type !== 'op') break;
      if (t.text === '%') {
        i++;
        left = { kind: 'percent', operand: left, start: left.start, end: t.end };
        continue;
      }
      const precedence = BINARY[t.text];
      if (precedence === undefined || precedence <= min) break;
      i++;
      // « ^ » est associatif à gauche dans Excel, comme les autres.
      const right = expression(precedence);
      left = { kind: 'binary', op: t.text, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  const root = list.length === 0 ? missing() : expression(0);
  if (i < list.length) errors.push({ error: 'unexpected', at: list[i]!.start });
  return { tokens, root, errors };
}

/** Fonction dont les parenthèses entourent `cursor`, et l'argument où il se trouve (à partir de 0). */
export function callAt(
  tokens: Token[],
  cursor: number,
  locale: FormulaLocale,
): { name: string; fn: FormulaFunction | undefined; argIndex: number } | null {
  const stack: { name: string | null; argIndex: number }[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (t.start >= cursor) break;
    if (t.type === 'open') {
      const previous = tokens.slice(0, k).findLast((p) => p.type !== 'space');
      stack.push({ name: previous?.type === 'func' ? previous.text : null, argIndex: 0 });
    } else if (t.type === 'close' && t.end <= cursor) stack.pop();
    else if (t.type === 'sep' && stack.length > 0) stack.at(-1)!.argIndex++;
  }
  const inner = stack.findLast((s) => s.name !== null);
  if (!inner?.name) return null;
  return { name: inner.name, fn: lookupFunction(inner.name, locale), argIndex: inner.argIndex };
}

/**
 * Le curseur attend-il un opérande (après « = », « ( », un séparateur ou un
 * opérateur) ? Un clic sur la grille y insère alors une référence.
 */
export function expectsOperand(tokens: Token[], cursor: number): boolean {
  if (tokens.some((t) => t.start < cursor && cursor < t.end && t.type !== 'space')) return false;
  const previous = tokens.findLast((t) => t.end <= cursor && t.type !== 'space');
  if (!previous) return true;
  return (
    (previous.type === 'op' && previous.text !== '%') ||
    previous.type === 'open' ||
    previous.type === 'sep' ||
    previous.type === 'arrayOpen'
  );
}
