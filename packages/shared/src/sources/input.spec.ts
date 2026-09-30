import { describe, expect, it } from 'vitest';
import { CellType } from '../enums.js';
import { parseCellInput } from './input.js';

describe('parseCellInput', () => {
  it('formule, texte forcé, vide', () => {
    expect(parseCellInput('=B2*C2')).toEqual({ formula: 'B2*C2' });
    expect(parseCellInput('=')).toMatchObject({ type: CellType.text, text: '=' });
    expect(parseCellInput("'0612")).toMatchObject({ type: CellType.text, text: '0612' });
    expect(parseCellInput('  ')).toMatchObject({ type: CellType.empty, text: null });
  });

  it('nombres à la française', () => {
    expect(parseCellInput('1 234,5')).toMatchObject({ type: CellType.number, number: 1234.5 });
    expect(parseCellInput('-3')).toMatchObject({ type: CellType.number, number: -3, text: '-3' });
    expect(parseCellInput('12.5')).toMatchObject({ number: 12.5 });
    expect(parseCellInput('1\u202f234')).toMatchObject({ number: 1234 });
    expect(parseCellInput('1 23')).toMatchObject({ type: CellType.text });
  });

  it('booléens et dates', () => {
    expect(parseCellInput('vrai')).toMatchObject({ type: CellType.bool, number: 1, text: 'VRAI' });
    expect(parseCellInput('FALSE')).toMatchObject({ type: CellType.bool, number: 0 });
    expect(parseCellInput('26/09/2026')).toMatchObject({
      type: CellType.date,
      text: '2026-09-26',
      number: 46291,
    });
    expect(parseCellInput('2026-09-26')).toMatchObject({ text: '2026-09-26' });
    expect(parseCellInput('31/02/2026')).toMatchObject({ type: CellType.text });
  });

  it('texte sinon, espaces gardés', () => {
    expect(parseCellInput(' Épée ')).toEqual({
      formula: null,
      type: CellType.text,
      text: ' Épée ',
      number: null,
    });
  });
});
