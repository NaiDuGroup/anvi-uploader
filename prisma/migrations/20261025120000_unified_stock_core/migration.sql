-- Unified stock core (docs/UNIFIED-STOCK-PLAN.md, stage 1).
-- Additive only: new tables, no changes to existing ones.

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "image_url" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "is_sellable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "internal_notes" TEXT,
    "legacy_kind" TEXT,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_variants" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT,
    "options" JSONB NOT NULL DEFAULT '{}',
    "stock_quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4),
    "purchase_cost" DECIMAL(14,4),
    "sell_price" DECIMAL(12,2),
    "dealer_price" DECIMAL(12,2),
    "reorder_level" DECIMAL(14,3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL DEFAULT 'main',
    "quantity" DECIMAL(14,3) NOT NULL,
    "total_cost_mdl" DECIMAL(14,2) NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier_idno" TEXT,
    "supplier_name" TEXT,
    "note" TEXT,
    "purchase_invoice_line_id" TEXT,
    "is_provisional" BOOLEAN NOT NULL DEFAULT false,
    "amounts_include_vat" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL DEFAULT 'main',
    "delta" DECIMAL(14,3) NOT NULL,
    "kind" TEXT NOT NULL,
    "cost_mdl" DECIMAL(14,2),
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "receipt_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_categories_code_key" ON "stock_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_sku_key" ON "stock_items"("sku");

-- CreateIndex
CREATE INDEX "stock_items_category_id_sort_order_idx" ON "stock_items"("category_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_legacy_kind_legacy_id_key" ON "stock_items"("legacy_kind", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_variants_sku_key" ON "stock_variants"("sku");

-- CreateIndex
CREATE INDEX "stock_variants_item_id_sort_order_idx" ON "stock_variants"("item_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_purchase_invoice_line_id_key" ON "stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE INDEX "stock_receipts_variant_id_purchased_at_idx" ON "stock_receipts"("variant_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "stock_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_variants" ADD CONSTRAINT "stock_variants_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "stock_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "stock_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default location: everything is kept in one place for now.
INSERT INTO "stock_locations" ("id", "name", "is_default", "is_active")
VALUES ('main', 'Основной', true, true)
ON CONFLICT ("id") DO NOTHING;

-- First categories that live only in the unified model.
INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "is_active", "updated_at")
VALUES
  (gen_random_uuid()::text, 'socks', 'product', 'Șosete', 'Носки', 'Socks', 'pcs', 10, true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'bodysuits', 'product', 'Body-uri', 'Боди', 'Bodysuits', 'pcs', 20, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
