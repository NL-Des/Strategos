import { LOGIN_BLOCK_MS } from './auth.constants.js';
import { type Attempt, computeBlock } from './login-throttle.service.js';

const now = new Date('2026-09-26T12:00:00Z');
const at = (msAgo: number, success = false): Attempt => ({
  success,
  createdAt: new Date(now.getTime() - msAgo),
});

describe('computeBlock', () => {
  it('permet la tentative sous 5 échecs', () => {
    expect(computeBlock([at(1), at(2), at(3), at(4)], now)).toBeNull();
  });

  it('bloque 15 minutes après le 5e échec consécutif', () => {
    expect(computeBlock([at(0), at(1), at(2), at(3), at(4)], now)).toBe(LOGIN_BLOCK_MS / 1000);
    expect(computeBlock([at(60_000), at(61_000), at(62_000), at(63_000), at(64_000)], now)).toBe(
      LOGIN_BLOCK_MS / 1000 - 60,
    );
  });

  it('un succès parmi les 5 dernières tentatives lève le blocage', () => {
    expect(computeBlock([at(0), at(1), at(2, true), at(3), at(4), at(5)], now)).toBeNull();
  });

  it('le blocage prend fin après 15 minutes', () => {
    const old = LOGIN_BLOCK_MS + 1;
    expect(
      computeBlock([at(old), at(old + 1), at(old + 2), at(old + 3), at(old + 4)], now),
    ).toBeNull();
  });
});
