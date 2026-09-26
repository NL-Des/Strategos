-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "type" "source_type" NOT NULL,
    "name" TEXT NOT NULL,
    "connection_info" JSONB NOT NULL,
    "status" "source_status" NOT NULL DEFAULT 'ok',
    "last_read_at" TIMESTAMPTZ,
    "last_imported_at" TIMESTAMPTZ,
    "last_downloaded_at" TIMESTAMPTZ,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_cells" (
    "source_id" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "value_type" "cell_type" NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL,
    "formula" TEXT,
    "needs_recalc" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staging_cells_pkey" PRIMARY KEY ("source_id","sheet","row","col")
);

-- CreateTable
CREATE TABLE "cell_references" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "referenced_source_id" UUID NOT NULL,
    "referenced_sheet" TEXT NOT NULL,
    "referenced_range" TEXT NOT NULL,

    CONSTRAINT "cell_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reimport_previews" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "uploaded_file_path" TEXT NOT NULL,
    "lost_validations" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reimport_previews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cell_references_source_id_sheet_row_col_idx" ON "cell_references"("source_id", "sheet", "row", "col");

-- CreateIndex
CREATE INDEX "cell_references_referenced_source_id_referenced_sheet_idx" ON "cell_references"("referenced_source_id", "referenced_sheet");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_cells" ADD CONSTRAINT "staging_cells_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_references" ADD CONSTRAINT "cell_references_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cell_references" ADD CONSTRAINT "cell_references_referenced_source_id_fkey" FOREIGN KEY ("referenced_source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimport_previews" ADD CONSTRAINT "reimport_previews_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reimport_previews" ADD CONSTRAINT "reimport_previews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
