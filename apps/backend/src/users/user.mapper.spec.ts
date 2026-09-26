import type { User } from '../generated/prisma/client.js';
import { toMe, toUserDetail } from './user.mapper.js';

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
    for (const dto of [toMe(user, null), toUserDetail(user)]) {
      expect(JSON.stringify(dto)).not.toContain('argon2');
      expect(dto).not.toHaveProperty('passwordHash');
    }
  });

  it('traduisent disabled_at en statut', () => {
    expect(toUserDetail(user).status).toBe('disabled');
    expect(toUserDetail({ ...user, disabledAt: null }).status).toBe('active');
  });
});
