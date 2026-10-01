-- CreateTable
CREATE TABLE "google_credentials" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "account_label" TEXT NOT NULL,
    "refresh_token_encrypted" BYTEA NOT NULL,
    "access_expires_at" TIMESTAMPTZ,
    "expired_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_credentials_pkey" PRIMARY KEY ("id")
);

-- Une seule ligne (14 §7).
ALTER TABLE "google_credentials" ADD CONSTRAINT "google_credentials_single_row" CHECK ("id" = 1);
