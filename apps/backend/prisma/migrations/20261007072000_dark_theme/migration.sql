-- Mode sombre (06 — Thèmes) : thème que toutes les pages utilisent quand
-- l'utilisateur active le mode sombre ; `NULL` = les pages gardent leur thème.
ALTER TABLE "settings" ADD COLUMN "dark_theme_id" UUID;

ALTER TABLE "settings" ADD CONSTRAINT "settings_dark_theme_id_fkey" FOREIGN KEY ("dark_theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Le thème fourni « Sombre » est désigné à l'installation.
UPDATE "settings" SET "dark_theme_id" = (SELECT "id" FROM "themes" WHERE "name" = 'Sombre');
