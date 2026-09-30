-- CreateTable
CREATE TABLE "workshop_batch_layouts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL DEFAULT 'image/png',
    "size_bytes" INTEGER NOT NULL,
    "tile_count" INTEGER NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workshop_batch_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_batch_layouts_kind_created_at_idx" ON "workshop_batch_layouts"("kind", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workshop_batch_layouts_deleted_at_idx" ON "workshop_batch_layouts"("deleted_at");

-- AddForeignKey
ALTER TABLE "workshop_batch_layouts" ADD CONSTRAINT "workshop_batch_layouts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
