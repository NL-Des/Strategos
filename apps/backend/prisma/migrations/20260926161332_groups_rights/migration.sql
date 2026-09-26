-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_groups" (
    "user_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("user_id","group_id")
);

-- CreateTable
CREATE TABLE "group_permissions" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "page_id" UUID,
    "space_id" UUID,
    "can_read" BOOLEAN NOT NULL DEFAULT false,
    "can_create_topic" BOOLEAN NOT NULL DEFAULT false,
    "can_post" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_spaces" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_mode" "topic_sort" NOT NULL DEFAULT 'activity',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "discussion_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_groups_group_id_idx" ON "user_groups"("group_id");

-- CreateIndex
CREATE INDEX "group_permissions_page_id_idx" ON "group_permissions"("page_id");

-- CreateIndex
CREATE INDEX "group_permissions_space_id_idx" ON "group_permissions"("space_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_permissions_group_id_page_id_key" ON "group_permissions"("group_id", "page_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_permissions_group_id_space_id_key" ON "group_permissions"("group_id", "space_id");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_spaces_block_id_key" ON "discussion_spaces"("block_id");

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "discussion_spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_spaces" ADD CONSTRAINT "discussion_spaces_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un nom de groupe libéré par une suppression douce peut être réutilisé.
CREATE UNIQUE INDEX "groups_name_active_key" ON "groups"("name") WHERE "deleted_at" IS NULL;

-- Permissions (14 §3) : exactement une cible ; une page n'accorde que la
-- lecture ; on ne crée pas sans lire.
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_single_target"
  CHECK (num_nonnulls("page_id", "space_id") = 1);
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_page_read_only"
  CHECK ("page_id" IS NULL OR (NOT "can_create_topic" AND NOT "can_post"));
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_create_requires_read"
  CHECK ((NOT "can_create_topic" AND NOT "can_post") OR "can_read");
