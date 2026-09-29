-- CreateTable
CREATE TABLE "user_notes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Notes actives d'un utilisateur, les plus récentes d'abord (14 §10).
CREATE INDEX "user_notes_user_id_updated_at_idx" ON "user_notes"("user_id", "updated_at" DESC) WHERE "deleted_at" IS NULL;

-- Thèmes complets (06 — Thèmes) : chaque thème existant passe au nouveau format.
-- Les réglages ajoutés prennent les valeurs du thème « Sobre », et la police
-- libre (`fontFamily`) devient une police de la liste fermée (`system`).
WITH defaults AS (
  SELECT '{
    "background": { "color": "#f6f7f9", "imageMediaId": null },
    "text": { "color": "#1c2330", "headingColor": "#1c2330", "linkColor": "#2f5bd3", "font": "system", "headingFont": "system", "size": 16 },
    "surface": { "color": "#ffffff", "borderColor": "#d9dde5", "radius": 8 },
    "buttons": { "background": "#2f5bd3", "color": "#ffffff", "radius": 6, "style": "filled" },
    "tables": { "headerBackground": "#eef1f6", "headerColor": "#1c2330", "borderColor": "#d9dde5", "stripeColor": "#f8f9fb" },
    "cards": { "background": "#ffffff", "borderColor": "#d9dde5", "titleColor": "#1c2330", "radius": 8, "shadow": false },
    "discussions": { "background": "#ffffff", "borderColor": "#d9dde5", "messageBackground": "#f6f7f9", "authorColor": "#2f5bd3", "radius": 8 }
  }'::jsonb AS d
)
UPDATE "themes" SET "config" = jsonb_build_object(
  'background', (d->'background') || COALESCE("config"->'background', '{}'::jsonb),
  'text', (d->'text') || (COALESCE("config"->'text', '{}'::jsonb) - 'fontFamily'),
  'surface', (d->'surface') || COALESCE("config"->'surface', '{}'::jsonb),
  'buttons', (d->'buttons') || COALESCE("config"->'buttons', '{}'::jsonb),
  'tables', d->'tables',
  'cards', d->'cards',
  'discussions', d->'discussions'
)
FROM defaults;
