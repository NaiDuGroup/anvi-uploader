-- CreateTable
CREATE TABLE "pen_products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "sell_price" DECIMAL(12,2),
    "dealer_price" DECIMAL(12,2),
    "purchase_cost" DECIMAL(12,2),
    "image_url" TEXT,
    "body_color_hex" TEXT NOT NULL DEFAULT '#1f1f1f',
    "clip_color_hex" TEXT NOT NULL DEFAULT '#c0c0c0',
    "print_width_cm" DECIMAL(5,2) NOT NULL DEFAULT 4.0,
    "print_height_cm" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "print_dpi" INTEGER NOT NULL DEFAULT 300,
    "has_3d_preview" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "pen_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pen_stock_movements" (
    "id" TEXT NOT NULL,
    "pen_product_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pen_stock_movements_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "pen_layout_data" JSONB,
ADD COLUMN "pen_product_id" TEXT,
ADD COLUMN "pen_product_snapshot" JSONB;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN "pen_layout_data" JSONB,
ADD COLUMN "pen_product_id" TEXT,
ADD COLUMN "pen_product_snapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "pen_products_sku_key" ON "pen_products"("sku");

-- CreateIndex
CREATE INDEX "pen_products_is_active_idx" ON "pen_products"("is_active");

-- CreateIndex
CREATE INDEX "pen_products_sort_order_idx" ON "pen_products"("sort_order");

-- CreateIndex
CREATE INDEX "pen_stock_movements_pen_product_id_created_at_idx" ON "pen_stock_movements"("pen_product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pen_stock_movements_order_id_idx" ON "pen_stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "orders_pen_product_id_idx" ON "orders"("pen_product_id");

-- CreateIndex
CREATE INDEX "order_lines_pen_product_id_idx" ON "order_lines"("pen_product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pen_product_id_fkey" FOREIGN KEY ("pen_product_id") REFERENCES "pen_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_pen_product_id_fkey" FOREIGN KEY ("pen_product_id") REFERENCES "pen_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_products" ADD CONSTRAINT "pen_products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_movements" ADD CONSTRAINT "pen_stock_movements_pen_product_id_fkey" FOREIGN KEY ("pen_product_id") REFERENCES "pen_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_movements" ADD CONSTRAINT "pen_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_movements" ADD CONSTRAINT "pen_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
