-- CreateTable
CREATE TABLE "backups" (
    "id" UUID NOT NULL,
    "status" "backup_status" NOT NULL DEFAULT 'running',
    "file_path" TEXT,
    "size_bytes" BIGINT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);
