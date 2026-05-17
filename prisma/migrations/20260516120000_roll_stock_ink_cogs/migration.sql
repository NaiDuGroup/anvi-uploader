-- AlterTable
ALTER TABLE "large_format_materials" ADD COLUMN "stock_linear_m" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN "avg_purchase_cost_per_lm" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "lf_roll_stock_receipts" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_lm" DECIMAL(14,3) NOT NULL,
    "total_cost_mdl" INTEGER NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lf_roll_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ink_inventory" (
    "id" TEXT NOT NULL,
    "stock_ml" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "avg_cost_per_ml_mdl" DECIMAL(16,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ink_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ink_stock_receipts" (
    "id" TEXT NOT NULL,
    "quantity_ml" DECIMAL(16,3) NOT NULL,
    "total_cost_mdl" INTEGER NOT NULL,
    "purchased_at" DATE NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ink_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lf_roll_stock_receipts_material_id_purchased_at_idx" ON "lf_roll_stock_receipts"("material_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "ink_stock_receipts_purchased_at_idx" ON "ink_stock_receipts"("purchased_at" DESC);

-- AddForeignKey
ALTER TABLE "lf_roll_stock_receipts" ADD CONSTRAINT "lf_roll_stock_receipts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "large_format_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lf_roll_stock_receipts" ADD CONSTRAINT "lf_roll_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ink_stock_receipts" ADD CONSTRAINT "ink_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ink_inventory" ("id", "stock_ml", "avg_cost_per_ml_mdl", "created_at", "updated_at")
VALUES ('default', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
