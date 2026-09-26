import { ERROR_CODES } from '@strategos/shared';
import fr from './fr.json';

describe('traductions fr', () => {
  it.each(ERROR_CODES)('traduit le code d’erreur %s', (code) => {
    expect((fr.errors as Record<string, string>)[code]).toBeTruthy();
  });
});
