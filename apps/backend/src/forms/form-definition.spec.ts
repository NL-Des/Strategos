import { CellType, type FormDefinition, type FormField } from '@strategos/shared';
import {
  conflictKeys,
  definitionErrors,
  inPerimeter,
  isConfigured,
  prefillValue,
  structuralChange,
  toStoredValue,
  validateValues,
} from './form-definition.js';

const field = (over: Partial<FormField>): FormField => ({
  key: 'f',
  label: 'F',
  help: '',
  type: 'text',
  required: false,
  ...over,
});

const SOURCE = '0190f0a0-0000-7000-8000-000000000001';

const modification: FormDefinition = {
  title: 'Trésor',
  intro: '',
  successMessage: '',
  sourceId: SOURCE,
  sheet: 'Stock',
  fields: [
    field({ key: 'or', type: 'number', cell: 'B2' }),
    field({ key: 'stock', type: 'number', cell: 'C2', movement: true }),
  ],
};

const ligne: FormDefinition = {
  ...modification,
  fields: [
    field({ key: 'qte', type: 'number', col: 'D', movement: true }),
    field({ key: 'note', col: 'E' }),
  ],
  rowStart: 2,
  rowEnd: null,
  keyCol: 'A',
  linkedBlockId: '0190f0a0-0000-7000-8000-000000000002',
};

const ajout: FormDefinition = {
  ...modification,
  fields: [
    field({ key: 'pseudo', col: 'A', auto: 'pseudo' }),
    field({
      key: 'classe',
      col: 'B',
      type: 'select',
      required: true,
      options: { kind: 'list', values: ['Mage', 'Voleur'] },
    }),
    field({ key: 'niveau', col: 'C', type: 'number', required: true, min: 1, max: 60 }),
  ],
  startRow: 12,
  maxNewRows: 20,
};

describe('configuration', () => {
  it('reconnaît un mapping complet selon le mode', () => {
    expect(isConfigured('modification', modification)).toBe(true);
    expect(isConfigured('ligne', ligne)).toBe(true);
    expect(isConfigured('ajout', ajout)).toBe(true);
    expect(isConfigured('ligne', { ...ligne, keyCol: undefined })).toBe(false);
    expect(isConfigured('modification', { ...modification, sourceId: null })).toBe(false);
    expect(isConfigured('modification', { ...modification, fields: [field({ key: 'x' })] })).toBe(
      false,
    );
  });

  it('refuse les incohérences', () => {
    expect(
      definitionErrors('ajout', {
        ...ajout,
        fields: [...ajout.fields, field({ key: 'pseudo', col: 'D' })],
      }),
    ).toHaveProperty(['definition.fields[3].key']);
    expect(
      definitionErrors('ajout', {
        ...ajout,
        fields: [field({ key: 'q', type: 'number', col: 'A', movement: true })],
      }),
    ).toHaveProperty(['definition.fields[0].movement']);
    expect(definitionErrors('modification', { ...modification, startRow: 3 })).toHaveProperty([
      'definition.startRow',
    ]);
  });
});

describe('périmètre', () => {
  it('limite chaque champ à sa cellule, sa colonne et sa zone', () => {
    const [or] = modification.fields;
    expect(inPerimeter('modification', modification, or!, { sheet: 'Stock', row: 2, col: 2 })).toBe(
      true,
    );
    expect(inPerimeter('modification', modification, or!, { sheet: 'Stock', row: 3, col: 2 })).toBe(
      false,
    );
    const niveau = ajout.fields[2]!;
    expect(inPerimeter('ajout', ajout, niveau, { sheet: 'Stock', row: 31, col: 3 })).toBe(true);
    expect(inPerimeter('ajout', ajout, niveau, { sheet: 'Stock', row: 32, col: 3 })).toBe(false);
    expect(inPerimeter('ajout', ajout, niveau, { sheet: 'Stock', row: 12, col: 4 })).toBe(false);
    expect(inPerimeter('ajout', ajout, niveau, { sheet: 'Autre', row: 12, col: 3 })).toBe(false);
  });
});

describe('changements structurels', () => {
  it('invalident : cible, champ ajouté, type, mouvement, zone, clé', () => {
    const moved = {
      ...modification,
      fields: [field({ key: 'or', type: 'number', cell: 'B3' }), modification.fields[1]!],
    };
    expect(structuralChange(modification, moved)).toBe(true);
    expect(structuralChange(ajout, { ...ajout, maxNewRows: 30 })).toBe(true);
    expect(structuralChange(ligne, { ...ligne, keyCol: 'B' })).toBe(true);
    expect(
      structuralChange(modification, { ...modification, fields: [modification.fields[0]!] }),
    ).toBe(true);
    const noMovement = {
      ...modification,
      fields: [modification.fields[0]!, { ...modification.fields[1]!, movement: false }],
    };
    expect(structuralChange(modification, noMovement)).toBe(true);
  });

  it("n'invalident pas : libellé, aide, ordre, options, règles", () => {
    const relabeled = {
      ...ajout,
      title: 'Autre titre',
      fields: [
        ajout.fields[2]!,
        {
          ...ajout.fields[1]!,
          label: 'Classe du perso',
          help: 'aide',
          options: { kind: 'list' as const, values: ['Mage'] },
        },
        { ...ajout.fields[0]!, required: true },
      ],
    };
    expect(structuralChange(ajout, relabeled)).toBe(false);
  });
});

describe('conflits', () => {
  it('par cellule, par clé et colonne, jamais pour un mouvement ou un ajout', () => {
    expect(conflictKeys('modification', modification, null)).toEqual([`${SOURCE}:Stock:r2:c2`]);
    expect(conflictKeys('ligne', ligne, '137')).toEqual([`${SOURCE}:Stock:key=137:c5`]);
    expect(conflictKeys('ajout', ajout, null)).toEqual([]);
  });
});

describe('valeurs soumises', () => {
  const context = {
    username: 'Kira',
    now: new Date('2026-09-28T10:00:00Z'),
    options: new Map([['classe', ['Mage', 'Voleur']]]),
  };

  it('remplit les champs automatiques et ignore la valeur envoyée', () => {
    const { values, fields } = validateValues(
      ajout,
      { pseudo: 'Autre', classe: 'Mage', niveau: 42 },
      context,
    );
    expect(fields).toEqual({});
    expect(values).toEqual({ pseudo: 'Kira', classe: 'Mage', niveau: 42 });
  });

  it('vérifie obligatoire, options, bornes et types', () => {
    expect(validateValues(ajout, { classe: 'Druide', niveau: 61 }, context).fields).toEqual({
      'values.classe': ['isIn'],
      'values.niveau': ['max'],
    });
    expect(validateValues(ajout, { niveau: 'abc' }, context).fields).toEqual({
      'values.classe': ['isDefined'],
      'values.niveau': ['invalid'],
    });
    const dated = {
      ...modification,
      fields: [field({ key: 'd', type: 'date', cell: 'A1', minDate: '2026-01-01' })],
    };
    expect(validateValues(dated, { d: '2026-02-30' }, context).fields).toEqual({
      'values.d': ['invalid'],
    });
    expect(validateValues(dated, { d: '2025-12-31' }, context).fields).toEqual({
      'values.d': ['min'],
    });
  });

  it('convertit en valeurs de cellule et pré-remplit', () => {
    expect(toStoredValue(field({ type: 'number' }), 5)).toEqual({
      type: CellType.number,
      text: '5',
      number: 5,
    });
    expect(toStoredValue(field({ type: 'date' }), '2026-09-26')).toEqual({
      type: CellType.date,
      text: '2026-09-26',
      number: 46291,
    });
    expect(toStoredValue(field({ type: 'checkbox' }), true)).toMatchObject({
      type: CellType.bool,
      number: 1,
    });
    expect(toStoredValue(field({}), null)).toMatchObject({ type: CellType.empty });
    const cell = { type: CellType.number, text: '8', number: 8, needsRecalc: false };
    expect(prefillValue(field({ type: 'number' }), cell)).toBe(8);
    expect(prefillValue(field({ type: 'number', movement: true }), cell)).toBeNull();
  });
});
