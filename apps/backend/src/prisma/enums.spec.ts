import { readFileSync } from 'node:fs';
import * as shared from '@strategos/shared';

/** Les `enum` du schéma Prisma et ceux de packages/shared ne doivent jamais diverger. */
describe('enums Prisma ↔ shared', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const prismaEnums = new Map<string, string[]>();
  for (const [, name, body] of schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
    const values = body!
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('@@') && !line.startsWith('//'));
    prismaEnums.set(name!, values);
  }

  it('déclare au moins un enum', () => {
    expect(prismaEnums.size).toBeGreaterThan(0);
  });

  it.each([...prismaEnums])('%s a les mêmes valeurs des deux côtés', (name, values) => {
    const sharedEnum = (shared as Record<string, unknown>)[name];
    expect(sharedEnum, `${name} absent de packages/shared`).toBeDefined();
    expect(Object.values(sharedEnum as object)).toEqual(values);
  });
});
