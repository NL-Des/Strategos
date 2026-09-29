-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "type" "template_type" NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "templates_type_name_key" ON "templates"("type", "name");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
