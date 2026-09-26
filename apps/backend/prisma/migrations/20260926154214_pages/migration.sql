-- CreateTable
CREATE TABLE "settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "landing_page_id" UUID,
    "default_theme_id" UUID,
    "backup_retention_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "alt" TEXT,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "theme_id" UUID,
    "show_header" BOOLEAN NOT NULL DEFAULT true,
    "show_footer" BOOLEAN NOT NULL DEFAULT true,
    "draft_config" JSONB NOT NULL DEFAULT '{}',
    "published_config" JSONB,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_parts" (
    "kind" "layout_kind" NOT NULL,
    "draft_config" JSONB NOT NULL DEFAULT '{}',
    "published_config" JSONB,
    "published_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "layout_parts_pkey" PRIMARY KEY ("kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "themes_name_key" ON "themes"("name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personal_page_id_fkey" FOREIGN KEY ("personal_page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_landing_page_id_fkey" FOREIGN KEY ("landing_page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_theme_id_fkey" FOREIGN KEY ("default_theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Réglages : une seule ligne (14 §4).
ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_backup_retention_positive" CHECK ("backup_retention_days" > 0);

-- Un nom de fichier libéré par une suppression douce peut être réutilisé.
CREATE UNIQUE INDEX "media_filename_active_key" ON "media"("filename") WHERE "deleted_at" IS NULL;

-- Données initiales (14 §13, point 12) : thème par défaut sobre, réglages,
-- header et footer vides.
WITH default_theme AS (
  INSERT INTO "themes" ("id", "name", "config")
  VALUES (uuidv7(), 'Sobre', '{
    "background": { "color": "#f6f7f9", "imageMediaId": null },
    "text": { "color": "#1c2330", "headingColor": "#1c2330", "linkColor": "#2f5bd3", "fontFamily": "system-ui, -apple-system, ''Segoe UI'', Roboto, sans-serif" },
    "surface": { "color": "#ffffff", "borderColor": "#d9dde5", "radius": 8 },
    "buttons": { "background": "#2f5bd3", "color": "#ffffff", "radius": 6 }
  }'::jsonb)
  RETURNING "id"
)
INSERT INTO "settings" ("id", "default_theme_id") SELECT 1, "id" FROM default_theme;

INSERT INTO "layout_parts" ("kind", "draft_config") VALUES
  ('header', '{"rows": []}'::jsonb),
  ('footer', '{"rows": []}'::jsonb);
