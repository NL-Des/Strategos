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

  it('détaille une valeur composée au lieu d’afficher [object Object]', () => {
    const changes = describeChanges(
      t,
      entry(null, { values: { classe: 'Mage', niveau: 20, actif: true, equipe: null } }),
    );
    expect(changes).toEqual([
      'values : classe = Mage ; niveau = 20 ; actif = common.yes ; equipe = —',
    ]);
  });

  it('traduit le statut selon la cible', () => {
    const submission = { ...entry({ status: 'pending' }, { status: 'validated' }) };
    submission.targetType = 'submission';
    const keys = ((key: string) => key) as TFunction;
    expect(describeChanges(keys, submission)).toEqual([
      'audit.fields.status : submissions.status.pending → submissions.status.validated',
    ]);
    expect(describeChanges(keys, entry({ status: 'active' }, { status: 'disabled' }))).toEqual([
      'audit.fields.status : admin.users.status_active → admin.users.status_disabled',
    ]);
  });

  it('nomme la cible par son pseudo, sinon par son id', () => {
    expect(targetLabel(entry(null, { username: 'kira' }))).toBe('kira');
    expect(targetLabel(entry(null, null))).toBe('id-kira');
  });
});
