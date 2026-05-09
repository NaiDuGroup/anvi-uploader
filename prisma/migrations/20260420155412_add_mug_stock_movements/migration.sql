-- CreateTable
CREATE TABLE "mug_stock_movements" (
    "id" TEXT NOT NULL,
    "mug_product_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mug_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mug_stock_movements_mug_product_id_created_at_idx" ON "mug_stock_movements"("mug_product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mug_stock_movements_order_id_idx" ON "mug_stock_movements"("order_id");

-- AddForeignKey
ALTER TABLE "mug_stock_movements" ADD CONSTRAINT "mug_stock_movements_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_stock_movements" ADD CONSTRAINT "mug_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_stock_movements" ADD CONSTRAINT "mug_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
