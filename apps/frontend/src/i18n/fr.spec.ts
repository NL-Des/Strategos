import { AVAILABLE_BLOCK_TYPES, ERROR_CODES, WARNING_CODES } from '@strategos/shared';
import fr from './fr.json';

describe('traductions fr', () => {
  it.each(ERROR_CODES)('traduit le code d’erreur %s', (code) => {
    expect((fr.errors as Record<string, string>)[code]).toBeTruthy();
  });

  it.each(WARNING_CODES)('traduit l’avertissement %s', (code) => {
    expect((fr.warnings as Record<string, string>)[code]).toBeTruthy();
  });

  it.each(AVAILABLE_BLOCK_TYPES)('nomme le module %s', (type) => {
    expect((fr.builder.blockTypes as Record<string, string>)[type]).toBeTruthy();
  });
});
