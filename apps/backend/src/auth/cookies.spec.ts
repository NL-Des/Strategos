import { cookieOptions } from './cookies.js';

describe('cookie de session', () => {
  const previous = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = previous;
  });

  it('`Secure` par défaut : seuls le développement et les tests déclarés s’en passent', () => {
    for (const env of ['production', 'prod', 'staging', '']) {
      process.env.NODE_ENV = env;
      expect([env, cookieOptions().secure]).toEqual([env, true]);
    }
    delete process.env.NODE_ENV;
    expect(cookieOptions().secure).toBe(true);
    for (const env of ['development', 'test']) {
      process.env.NODE_ENV = env;
      expect([env, cookieOptions().secure]).toEqual([env, false]);
    }
  });
});
