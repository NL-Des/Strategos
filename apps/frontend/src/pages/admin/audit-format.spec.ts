import type { AuditEntry } from '@strategos/shared';
import type { TFunction } from 'i18next';
import { describeChanges, targetLabel } from './audit-format';

const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as TFunction;

const entry = (before: unknown, after: unknown): AuditEntry => ({
  id: '1',
  actorKind: 'user',
  actor: null,
  action: 'user.update',
  targetType: 'user',
  targetId: 'id-kira',
  before,
  after,
  ip: null,
  createdAt: '2026-09-26T12:00:00Z',
});

describe('présentation du journal', () => {
  it('ne liste que les champs modifiés', () => {
    const changes = describeChanges(
      t,
      entry({ username: 'kira', deleted: false }, { username: 'kira2', deleted: false }),
    );
    expect(changes).toEqual(['username : kira → kira2']);
  });

  it('liste les valeurs initiales à la création', () => {
    expect(describeChanges(t, entry(null, { username: 'kira' }))).toEqual(['username : kira']);
  });

  it('nomme la cible par son pseudo, sinon par son id', () => {
    expect(targetLabel(entry(null, { username: 'kira' }))).toBe('kira');
    expect(targetLabel(entry(null, null))).toBe('id-kira');
  });
});
