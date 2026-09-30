import { FORMULA_ARGS, FORMULA_CATEGORIES, FORMULA_FUNCTIONS } from '@strategos/shared';
import fr from './fr.json';

describe('traductions de l’assistant de formules', () => {
  it.each(FORMULA_FUNCTIONS.map((f) => f.en))('décrit la fonction %s', (name) => {
    expect((fr.formulas.functions as Record<string, string>)[name]).toBeTruthy();
  });

  it.each(FORMULA_ARGS)('nomme et décrit l’argument %s', (key) => {
    const arg = (fr.formulas.args as Record<string, { label: string; help: string }>)[key];
    expect(arg?.label).toBeTruthy();
    expect(arg?.help).toBeTruthy();
  });

  it.each(FORMULA_CATEGORIES)('nomme la catégorie %s', (category) => {
    expect((fr.formulas.categories as Record<string, string>)[category]).toBeTruthy();
  });
});
