import { deriveCsrfToken, randomSecret, verifyCsrfToken } from './csrf.js';

describe('jeton CSRF', () => {
  it('se vérifie avec le secret qui l’a produit, et lui seul', () => {
    const secret = randomSecret();
    const token = deriveCsrfToken(secret);
    expect(verifyCsrfToken(secret, token)).toBe(true);
    expect(verifyCsrfToken(randomSecret(), token)).toBe(false);
    expect(verifyCsrfToken(secret, `${token}x`)).toBe(false);
    expect(verifyCsrfToken(secret, '')).toBe(false);
  });

  it('ne révèle pas le secret', () => {
    const secret = randomSecret();
    expect(deriveCsrfToken(secret)).not.toContain(secret);
  });
});
