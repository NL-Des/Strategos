-- CreateTable
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "mode" "form_mode" NOT NULL,
    "draft_definition" JSONB NOT NULL,
    "published_version" INTEGER,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "closes_at" TIMESTAMPTZ,
    "auto_validate" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "form_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID NOT NULL,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("form_id","version")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "form_version" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "values" JSONB NOT NULL,
    "row_key" TEXT,
    "conflict_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "submission_status" NOT NULL DEFAULT 'pending',
    "assigned_row" INTEGER,
    "written" JSONB,
    "reason" TEXT,
    "decided_at" TIMESTAMPTZ,
    "decided_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forms_block_id_key" ON "forms"("block_id");

-- CreateIndex
CREATE INDEX "submissions_status_created_at_idx" ON "submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "submissions_form_id_status_idx" ON "submissions"("form_id", "status");

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_id_published_version_fkey" FOREIGN KEY ("id", "published_version") REFERENCES "form_versions"("form_id", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_form_version_fkey" FOREIGN KEY ("form_id", "form_version") REFERENCES "form_versions"("form_id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL non exprimable en Prisma (14 §8).
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_decided_check"
  CHECK ("status" = 'pending' OR "decided_at" IS NOT NULL);
ALTER TABLE "forms" ADD CONSTRAINT "forms_published_version_positive"
  CHECK ("published_version" IS NULL OR "published_version" > 0);

-- « Mes soumissions ».
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at" DESC);

-- Conflits : recouvrement des cellules visées (`&&`) entre soumissions en attente.
CREATE INDEX "submissions_conflict_keys_pending_idx" ON "submissions" USING GIN ("conflict_keys")
  WHERE "status" = 'pending';
