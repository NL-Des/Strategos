import { readFileSync } from 'node:fs';
import { THEME_PRESETS } from '@strategos/shared';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../prisma/migrations/20261007071000_theme_presets/migration.sql', import.meta.url),
  'utf8',
);

/**
 * La migration `theme_presets` installe les thèmes fournis : elle doit rester la
 * copie de `THEME_PRESETS`. Un thème ajouté ou modifié demande une nouvelle migration.
 */
describe('thèmes fournis à l’installation', () => {
  it.each(THEME_PRESETS.filter((p) => p.key !== 'sobre').map((p) => [p.name, p] as const))(
    '%s est créé par la migration, avec les réglages du modèle',
    (name, preset) => {
      expect(migration).toContain(`SELECT uuidv7(), '${name}', '${JSON.stringify(preset.config)}'`);
    },
  );
});
