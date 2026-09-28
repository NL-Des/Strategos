-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "pinned_at" TIMESTAMPTZ,
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_messages" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ,
    "hidden_at" TIMESTAMPTZ,
    "hidden_by" UUID,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "topic_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_revisions" (
    "id" UUID NOT NULL,
    "topic_message_id" UUID,
    "chat_message_id" UUID,
    "action" "revision_action" NOT NULL,
    "previous_content" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "topic_message_id" UUID,
    "chat_message_id" UUID,
    "storage_path" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (sujets : épinglés en tête, puis activité récente ; 14 §6)
CREATE INDEX "topics_space_sort_idx" ON "topics" ("space_id", "pinned_at" DESC NULLS LAST, "last_activity_at" DESC) WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "topic_messages_topic_id_id_idx" ON "topic_messages"("topic_id", "id");

-- CreateIndex
CREATE INDEX "message_revisions_topic_message_id_idx" ON "message_revisions"("topic_message_id");

-- CreateIndex
CREATE INDEX "message_revisions_chat_message_id_idx" ON "message_revisions"("chat_message_id");

-- CreateIndex
CREATE INDEX "attachments_topic_message_id_idx" ON "attachments"("topic_message_id");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "discussion_spaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_messages" ADD CONSTRAINT "topic_messages_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_messages" ADD CONSTRAINT "topic_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_messages" ADD CONSTRAINT "topic_messages_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_topic_message_id_fkey" FOREIGN KEY ("topic_message_id") REFERENCES "topic_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_topic_message_id_fkey" FOREIGN KEY ("topic_message_id") REFERENCES "topic_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une révision archive exactement un message (sujet ou chat) ; la FK chat arrive à l'étape 9.
ALTER TABLE "message_revisions" ADD CONSTRAINT "message_revisions_one_target" CHECK (num_nonnulls("topic_message_id", "chat_message_id") = 1);

-- Une pièce jointe est libre (juste uploadée) ou rattachée à un seul message.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_one_target" CHECK (num_nonnulls("topic_message_id", "chat_message_id") <= 1);

-- Taille maximale d'une pièce jointe : 5 Mo (07 — Pièces jointes).
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_size_max" CHECK ("size_bytes" <= 5242880);
