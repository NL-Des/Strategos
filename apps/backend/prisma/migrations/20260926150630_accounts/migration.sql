-- Pseudos insensibles à la casse.
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "must_change_credentials" BOOLEAN NOT NULL DEFAULT true,
    "personal_page_id" UUID,
    "disabled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "csrf_secret" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "username" CITEXT NOT NULL,
    "ip" INET NOT NULL,
    "success" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_username_created_at_idx" ON "login_attempts"("username", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unicités partielles (14 §1 et §2) : un pseudo libéré par une suppression
-- douce peut être réutilisé ; un seul compte administrateur.
CREATE UNIQUE INDEX "users_username_active_key" ON "users"("username") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "users_single_admin_key" ON "users"("is_admin") WHERE "is_admin";

-- Données initiales (14 §13, point 12) : compte admin / admin, changement
-- d'identifiants forcé à la première connexion (02 — Compte administrateur).
INSERT INTO "users" ("id", "username", "password_hash", "is_admin", "must_change_credentials")
VALUES (uuidv7(), 'admin', '$argon2id$v=19$m=65536,p=4,t=3$EyO7yhj7RoGErIM3S9i0hw$I6goDTT2cpu3up/PPdgaPDp9bXAVyr2JkfAV4ADEp2A', true, true);
