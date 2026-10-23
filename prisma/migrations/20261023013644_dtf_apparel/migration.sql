-- AlterTable
ALTER TABLE "accounting_settings" ADD COLUMN     "dtf_settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "dtf_line_data" JSONB;

-- CreateTable
CREATE TABLE "garment_products" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color_name" TEXT NOT NULL,
    "color_hex" TEXT,
    "price_tiers" JSONB NOT NULL DEFAULT '[]',
    "purchase_cost" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garment_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garment_variants" (
    "id" TEXT NOT NULL,
    "garment_product_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "avg_purchase_cost" DECIMAL(14,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garment_stock_receipts" (
    "id" TEXT NOT NULL,
    "garment_variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchase_invoice_line_id" TEXT,
    "is_provisional" BOOLEAN NOT NULL DEFAULT false,
    "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "garment_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garment_stock_movements" (
    "id" TEXT NOT NULL,
    "garment_variant_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "cost_mdl" DECIMAL(14,2),
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garment_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtf_consumable_stock" (
    "id" TEXT NOT NULL,
    "stock_quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "avg_cost_per_unit_mdl" DECIMAL(16,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dtf_consumable_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtf_consumable_receipts" (
    "id" TEXT NOT NULL,
    "consumable_id" TEXT NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchase_invoice_line_id" TEXT,
    "is_provisional" BOOLEAN NOT NULL DEFAULT false,
    "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dtf_consumable_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtf_consumable_movements" (
    "id" TEXT NOT NULL,
    "consumable_id" TEXT NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "cost_mdl" DECIMAL(14,2),
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dtf_consumable_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtf_print_presets" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width_cm" DECIMAL(6,2) NOT NULL,
    "height_cm" DECIMAL(6,2) NOT NULL,
    "retail_price" DECIMAL(12,2) NOT NULL,
    "dealer_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dtf_print_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "garment_products_is_active_sort_order_idx" ON "garment_products"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "garment_products_name_color_name_key" ON "garment_products"("name", "color_name");

-- CreateIndex
CREATE UNIQUE INDEX "garment_variants_garment_product_id_size_key" ON "garment_variants"("garment_product_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "garment_stock_receipts_purchase_invoice_line_id_key" ON "garment_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE INDEX "garment_stock_receipts_garment_variant_id_purchased_at_idx" ON "garment_stock_receipts"("garment_variant_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "garment_stock_movements_garment_variant_id_created_at_idx" ON "garment_stock_movements"("garment_variant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "garment_stock_movements_order_id_idx" ON "garment_stock_movements"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dtf_consumable_receipts_purchase_invoice_line_id_key" ON "dtf_consumable_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE INDEX "dtf_consumable_receipts_consumable_id_purchased_at_idx" ON "dtf_consumable_receipts"("consumable_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "dtf_consumable_movements_consumable_id_created_at_idx" ON "dtf_consumable_movements"("consumable_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dtf_consumable_movements_order_id_idx" ON "dtf_consumable_movements"("order_id");

-- CreateIndex
CREATE INDEX "dtf_print_presets_is_active_sort_order_idx" ON "dtf_print_presets"("is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "garment_variants" ADD CONSTRAINT "garment_variants_garment_product_id_fkey" FOREIGN KEY ("garment_product_id") REFERENCES "garment_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_receipts" ADD CONSTRAINT "garment_stock_receipts_garment_variant_id_fkey" FOREIGN KEY ("garment_variant_id") REFERENCES "garment_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_receipts" ADD CONSTRAINT "garment_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_movements" ADD CONSTRAINT "garment_stock_movements_garment_variant_id_fkey" FOREIGN KEY ("garment_variant_id") REFERENCES "garment_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_movements" ADD CONSTRAINT "garment_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_movements" ADD CONSTRAINT "garment_stock_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garment_stock_movements" ADD CONSTRAINT "garment_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_receipts" ADD CONSTRAINT "dtf_consumable_receipts_consumable_id_fkey" FOREIGN KEY ("consumable_id") REFERENCES "dtf_consumable_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_receipts" ADD CONSTRAINT "dtf_consumable_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_movements" ADD CONSTRAINT "dtf_consumable_movements_consumable_id_fkey" FOREIGN KEY ("consumable_id") REFERENCES "dtf_consumable_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_movements" ADD CONSTRAINT "dtf_consumable_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_movements" ADD CONSTRAINT "dtf_consumable_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtf_consumable_movements" ADD CONSTRAINT "dtf_consumable_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed consumable balances so receipts and order deductions find their rows.
INSERT INTO "dtf_consumable_stock" ("id", "updated_at") VALUES ('dtf_film', CURRENT_TIMESTAMP), ('dtf_powder', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Studio price list (DTF on fabric, page 14) plus the chest-logo rate used in orders.
INSERT INTO "dtf_print_presets" ("id", "label", "width_cm", "height_cm", "retail_price", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'Logo 10×10', 10, 10, 50, 0, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'A6 10×15', 10, 15, 100, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'A5 15×21', 15, 21, 140, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'A4 21×30', 21, 30, 180, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'A3 30×42', 30, 42, 220, 4, CURRENT_TIMESTAMP);
