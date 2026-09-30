-- CreateTable
CREATE TABLE "source_cell_edits" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_cell_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_cell_edits_source_id_created_at_idx" ON "source_cell_edits"("source_id", "created_at");

-- AddForeignKey
ALTER TABLE "source_cell_edits" ADD CONSTRAINT "source_cell_edits_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_cell_edits" ADD CONSTRAINT "source_cell_edits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
