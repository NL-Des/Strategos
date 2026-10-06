-- Google Sheet relié par un script Apps Script (08) : lecture et écriture, sans projet Google Cloud.
ALTER TYPE "source_type" ADD VALUE 'gsheet_script';

-- Secret partagé avec le script, chiffré (AES-256-GCM).
ALTER TABLE "sources" ADD COLUMN "connection_secret" BYTEA;
