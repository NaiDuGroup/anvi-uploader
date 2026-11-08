-- «Библиотека макетов»: permanent copies of recurring order artwork under the
-- `library/` prefix (outside the 7-day `uploads/` lifecycle rule). Additive only.
CREATE TABLE "library_files" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "title" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" DOUBLE PRECISION,
    "pixel_width" INTEGER,
    "pixel_height" INTEGER,
    "dpi" DOUBLE PRECISION,
    "width_mm" DOUBLE PRECISION,
    "height_mm" DOUBLE PRECISION,
    "page_count" INTEGER,
    "source_order_id" TEXT,
    "source_file_id" TEXT,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "library_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "library_files_storage_key_key" ON "library_files"("storage_key");
CREATE INDEX "library_files_client_id_idx" ON "library_files"("client_id");
CREATE INDEX "library_files_source_file_id_idx" ON "library_files"("source_file_id");

ALTER TABLE "library_files" ADD CONSTRAINT "library_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
