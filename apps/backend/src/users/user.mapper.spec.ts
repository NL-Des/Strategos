import type { User } from '../generated/prisma/client.js';
import { toMe, toUserDetail, toUserSummary } from './user.mapper.js';

const user: User = {
  id: '0190f5c0-0000-7000-8000-000000000001',
  username: 'kira',
  passwordHash: '$argon2id$secret',
  isAdmin: false,
  mustChangeCredentials: true,
  personalPageId: null,
  disabledAt: new Date(),
  createdAt: new Date('2026-09-26T12:00:00Z'),
  updatedAt: new Date(),
  deletedAt: null,
  version: 3,
};

describe('mappers de compte', () => {
  it('ne renvoient jamais le hash du mot de passe', () => {
    const rights = { user: { id: user.id, username: user.username }, groups: [], resources: [] };
    for (const dto of [toMe(user, null), toUserSummary(user), toUserDetail(user, rights)]) {
      expect(JSON.stringify(dto)).not.toContain('argon2');
      expect(dto).not.toHaveProperty('passwordHash');
    }
  });

  it('traduisent disabled_at en statut', () => {
    expect(toUserSummary(user).status).toBe('disabled');
    expect(toUserSummary({ ...user, disabledAt: null }).status).toBe('active');
  });
});
