-- AlterTable
ALTER TABLE "orders"
ADD COLUMN     "notebook_layout_data" JSONB,
ADD COLUMN     "notebook_product_id" TEXT,
ADD COLUMN     "notebook_product_snapshot" JSONB;

-- CreateTable
CREATE TABLE "notebook_products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "sell_price" INTEGER,
    "dealer_price" INTEGER,
    "image_url" TEXT,
    "cover_color_hex" TEXT NOT NULL DEFAULT '#1f1f1f',
    "strap_color_hex" TEXT NOT NULL DEFAULT '#1f1f1f',
    "bookmark_color_hex" TEXT NOT NULL DEFAULT '#c0392b',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "notebook_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notebook_products_sku_key" ON "notebook_products"("sku");

-- CreateIndex
CREATE INDEX "notebook_products_is_active_idx" ON "notebook_products"("is_active");

-- CreateIndex
CREATE INDEX "notebook_products_sort_order_idx" ON "notebook_products"("sort_order");

-- CreateTable
CREATE TABLE "notebook_stock_movements" (
    "id" TEXT NOT NULL,
    "notebook_product_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebook_stock_movements_notebook_product_id_created_at_idx" ON "notebook_stock_movements"("notebook_product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notebook_stock_movements_order_id_idx" ON "notebook_stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "orders_notebook_product_id_idx" ON "orders"("notebook_product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_notebook_product_id_fkey" FOREIGN KEY ("notebook_product_id") REFERENCES "notebook_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_products" ADD CONSTRAINT "notebook_products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_stock_movements" ADD CONSTRAINT "notebook_stock_movements_notebook_product_id_fkey" FOREIGN KEY ("notebook_product_id") REFERENCES "notebook_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_stock_movements" ADD CONSTRAINT "notebook_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_stock_movements" ADD CONSTRAINT "notebook_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
