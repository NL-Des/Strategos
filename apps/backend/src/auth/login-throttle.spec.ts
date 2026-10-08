import { LOGIN_BLOCK_MS, LOGIN_DELAY_MAX_MS } from './auth.constants.js';
import { type Attempt, computeBlock, computeDelay } from './login-throttle.service.js';

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

describe('computeDelay', () => {
  const failures = (count: number, lastMsAgo = 0) =>
    Array.from({ length: count }, (_v, i) => at(lastMsAgo + i * 1000));

  it('aucune attente sous 5 échecs consécutifs', () => {
    expect(computeDelay(failures(4), now)).toBeNull();
  });

  it('l’attente double à chaque échec, puis plafonne', () => {
    expect(computeDelay(failures(5), now)).toBe(1);
    expect(computeDelay(failures(6), now)).toBe(2);
    expect(computeDelay(failures(7), now)).toBe(4);
    expect(computeDelay(failures(8), now)).toBe(8);
    expect(computeDelay(failures(9), now)).toBe(LOGIN_DELAY_MAX_MS / 1000);
    expect(computeDelay(failures(30), now)).toBe(LOGIN_DELAY_MAX_MS / 1000);
  });

  it('l’attente court depuis le dernier échec', () => {
    expect(computeDelay(failures(7, 3000), now)).toBe(1);
    expect(computeDelay(failures(7, 4000), now)).toBeNull();
  });

  it('un succès, ou un échec trop ancien, interrompt le décompte', () => {
    expect(computeDelay([at(0), at(1), at(2), at(3), at(4, true), at(5), at(6)], now)).toBeNull();
    expect(
      computeDelay(
        [at(0), at(1), at(2), at(3), at(LOGIN_BLOCK_MS + 1), at(LOGIN_BLOCK_MS + 2)],
        now,
      ),
    ).toBeNull();
  });
});

describe('computeBlock par adresse', () => {
  it('le seuil se règle : 20 échecs pour une adresse partagée', () => {
    const many = Array.from({ length: 20 }, (_v, i) => at(i));
    expect(computeBlock(many.slice(0, 19), now, 20)).toBeNull();
    expect(computeBlock(many, now, 20)).toBe(LOGIN_BLOCK_MS / 1000);
  });
});
