-- Dealer self-service (stage 1): edit / cancel own orders until printing starts.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "dealer_edited_at" TIMESTAMP(3),
ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancel_reason" TEXT,
ADD COLUMN "cancelled_by_id" TEXT;

-- CreateTable
CREATE TABLE "order_file_archive" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_line_id" TEXT,
    "line_product_type" TEXT,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT 'bw',
    "paper_type" TEXT,
    "page_count" INTEGER,
    "reason" TEXT NOT NULL DEFAULT 'dealer_edit',
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_by_id" TEXT,

    CONSTRAINT "order_file_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_file_archive_order_id_archived_at_idx" ON "order_file_archive"("order_id", "archived_at");

-- AddForeignKey
ALTER TABLE "order_file_archive" ADD CONSTRAINT "order_file_archive_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
