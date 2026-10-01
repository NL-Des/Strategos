-- CreateTable
CREATE TABLE "google_app" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "client_id" TEXT NOT NULL,
    "client_secret_encrypted" BYTEA NOT NULL,
    "api_key" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_app_pkey" PRIMARY KEY ("id")
);

-- Une seule ligne (14 §7).
ALTER TABLE "google_app" ADD CONSTRAINT "google_app_single_row" CHECK ("id" = 1);
