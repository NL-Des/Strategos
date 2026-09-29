import type { Db } from '../prisma/prisma.types.js';

/** Pages et header/footer qui citent un identifiant. */
export interface JsonUsages {
  pages: { id: string; name: string }[];
  layouts: string[];
}

/**
 * Pages (brouillon ou version publiée) et header/footer dont la configuration
 * cite `id` : une image de la médiathèque, une source de données… Une page
 * compte aussi quand l'un de ses formulaires (brouillon ou version en ligne)
 * cite `id`, par exemple la source où il écrit.
 */
export async function findJsonUsages(db: Db, id: string): Promise<JsonUsages> {
  const pattern = `%${id}%`;
  const [pages, layouts] = await Promise.all([
    db.$queryRaw<{ id: string; name: string }[]>`
      SELECT p.id, p.name FROM pages p
      WHERE p.deleted_at IS NULL
        AND (
          p.draft_config::text LIKE ${pattern}
          OR p.published_config::text LIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM forms f
            LEFT JOIN form_versions v ON v.form_id = f.id AND v.version = f.published_version
            WHERE f.page_id = p.id
              AND f.deleted_at IS NULL
              AND (f.draft_definition::text LIKE ${pattern} OR v.definition::text LIKE ${pattern})
          )
        )
      ORDER BY p.name`,
    db.$queryRaw<{ kind: string }[]>`
      SELECT kind::text AS kind FROM layout_parts
      WHERE draft_config::text LIKE ${pattern} OR published_config::text LIKE ${pattern}
      ORDER BY kind`,
  ]);
  return { pages, layouts: layouts.map((l) => l.kind) };
}

/** Thèmes dont la configuration cite `id` (image de fond de la médiathèque). */
export function findThemeUsages(db: Db, id: string): Promise<{ id: string; name: string }[]> {
  return db.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name::text AS name FROM themes
    WHERE config::text LIKE ${`%${id}%`}
    ORDER BY name`;
}
