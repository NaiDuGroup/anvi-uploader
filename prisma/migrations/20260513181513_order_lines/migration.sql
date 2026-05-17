-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "product_type" TEXT NOT NULL,
    "mug_layout_data" JSONB,
    "mug_product_id" TEXT,
    "mug_product_snapshot" JSONB,
    "notebook_layout_data" JSONB,
    "notebook_product_id" TEXT,
    "notebook_product_snapshot" JSONB,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_lines_order_id_sort_order_idx" ON "order_lines"("order_id", "sort_order");
CREATE INDEX "order_lines_mug_product_id_idx" ON "order_lines"("mug_product_id");
CREATE INDEX "order_lines_notebook_product_id_idx" ON "order_lines"("notebook_product_id");

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_notebook_product_id_fkey" FOREIGN KEY ("notebook_product_id") REFERENCES "notebook_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One line per existing order (copy mug/notebook fields from orders row)
INSERT INTO "order_lines" (
    "id",
    "order_id",
    "sort_order",
    "product_type",
    "mug_layout_data",
    "mug_product_id",
    "mug_product_snapshot",
    "notebook_layout_data",
    "notebook_product_id",
    "notebook_product_snapshot"
)
SELECT
    gen_random_uuid()::text,
    "id",
    0,
    "product_type",
    "mug_layout_data",
    "mug_product_id",
    "mug_product_snapshot",
    "notebook_layout_data",
    "notebook_product_id",
    "notebook_product_snapshot"
FROM "orders";

-- Files: nullable first, then backfill from the single line per order
ALTER TABLE "files" ADD COLUMN "order_line_id" TEXT;

UPDATE "files" AS f
SET "order_line_id" = ol."id"
FROM "order_lines" AS ol
WHERE ol."order_id" = f."order_id";

ALTER TABLE "files" ALTER COLUMN "order_line_id" SET NOT NULL;

CREATE INDEX "files_order_line_id_idx" ON "files"("order_line_id");

ALTER TABLE "files" ADD CONSTRAINT "files_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
