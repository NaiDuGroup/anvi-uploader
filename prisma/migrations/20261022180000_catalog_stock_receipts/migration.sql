-- AlterTable
ALTER TABLE "mug_products" ADD COLUMN     "avg_purchase_cost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "notebook_products" ADD COLUMN     "avg_purchase_cost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "notebook_stock_movements" ADD COLUMN     "cost_mdl" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "pen_products" ADD COLUMN     "avg_purchase_cost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "pen_stock_movements" ADD COLUMN     "cost_mdl" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "mug_stock_movements" ADD COLUMN     "cost_mdl" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "notebook_stock_receipts" (
    "id" TEXT NOT NULL,
    "notebook_product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pen_stock_receipts" (
    "id" TEXT NOT NULL,
    "pen_product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pen_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mug_stock_receipts" (
    "id" TEXT NOT NULL,
    "mug_product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mug_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebook_stock_receipts_notebook_product_id_purchased_at_idx" ON "notebook_stock_receipts"("notebook_product_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "pen_stock_receipts_pen_product_id_purchased_at_idx" ON "pen_stock_receipts"("pen_product_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "mug_stock_receipts_mug_product_id_purchased_at_idx" ON "mug_stock_receipts"("mug_product_id", "purchased_at" DESC);

-- AddForeignKey
ALTER TABLE "notebook_stock_receipts" ADD CONSTRAINT "notebook_stock_receipts_notebook_product_id_fkey" FOREIGN KEY ("notebook_product_id") REFERENCES "notebook_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_stock_receipts" ADD CONSTRAINT "notebook_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_receipts" ADD CONSTRAINT "pen_stock_receipts_pen_product_id_fkey" FOREIGN KEY ("pen_product_id") REFERENCES "pen_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_receipts" ADD CONSTRAINT "pen_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_stock_receipts" ADD CONSTRAINT "mug_stock_receipts_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_stock_receipts" ADD CONSTRAINT "mug_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

