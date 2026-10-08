-- Images externes des catalogues (04 — Réglages de l'instance) : l'admin choisit
-- entre tous les liens web (comportement d'origine, par défaut), une liste de
-- domaines, ou la médiathèque seule.
-- CreateEnum
CREATE TYPE "external_images" AS ENUM ('all', 'allowlist', 'none');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "external_image_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "external_images" "external_images" NOT NULL DEFAULT 'all';
