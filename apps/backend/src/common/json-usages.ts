import type { Db } from '../prisma/prisma.types.js';

/** Pages et header/footer qui citent un identifiant. */
export interface JsonUsages {
  pages: { id: string; name: string }[];
  layouts: string[];
}

/**
 * Pages (brouillon ou version publiée) et header/footer dont la configuration
 * cite `id` : une image de la médiathèque, une source de données…
 */
export async function findJsonUsages(db: Db, id: string): Promise<JsonUsages> {
  const pattern = `%${id}%`;
  const [pages, layouts] = await Promise.all([
    db.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM pages
      WHERE deleted_at IS NULL
        AND (draft_config::text LIKE ${pattern} OR published_config::text LIKE ${pattern})
      ORDER BY name`,
    db.$queryRaw<{ kind: string }[]>`
      SELECT kind::text AS kind FROM layout_parts
      WHERE draft_config::text LIKE ${pattern} OR published_config::text LIKE ${pattern}
      ORDER BY kind`,
  ]);
  return { pages, layouts: layouts.map((l) => l.kind) };
}
