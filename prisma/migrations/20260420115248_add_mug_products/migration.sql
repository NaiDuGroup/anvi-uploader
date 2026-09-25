/*
  Warnings:

  - You are about to drop the column `category_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `price_auto_calculated` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `price_tier` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `product_categories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `products` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey (idempotent: only drop if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name = 'orders_category_id_fkey' AND table_name = 'orders') THEN
    ALTER TABLE "orders" DROP CONSTRAINT "orders_category_id_fkey";
  END IF;
END $$;

-- DropForeignKey (idempotent: only drop if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name = 'orders_product_id_fkey' AND table_name = 'orders') THEN
    ALTER TABLE "orders" DROP CONSTRAINT "orders_product_id_fkey";
  END IF;
END $$;

-- DropForeignKey (idempotent: only drop if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name = 'products_category_id_fkey' AND table_name = 'products') THEN
    ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";
  END IF;
END $$;

-- DropForeignKey from order_items (if table exists - handles P3018 dependency error)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name = 'order_items_category_id_fkey' AND table_name = 'order_items') THEN
    ALTER TABLE "order_items" DROP CONSTRAINT "order_items_category_id_fkey";
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
             WHERE constraint_name = 'order_items_product_id_fkey' AND table_name = 'order_items') THEN
    ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";
  END IF;
END $$;

-- DropIndex (idempotent: only drop if exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orders_category_id_idx') THEN
    DROP INDEX "orders_category_id_idx";
  END IF;
END $$;

-- AlterTable (idempotent: only drop/add columns if needed)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'orders' AND column_name = 'category_id') THEN
    ALTER TABLE "orders" DROP COLUMN "category_id";
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'orders' AND column_name = 'price_auto_calculated') THEN
    ALTER TABLE "orders" DROP COLUMN "price_auto_calculated";
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'orders' AND column_name = 'price_tier') THEN
    ALTER TABLE "orders" DROP COLUMN "price_tier";
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'orders' AND column_name = 'product_id') THEN
    ALTER TABLE "orders" DROP COLUMN "product_id";
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'orders' AND column_name = 'quantity') THEN
    ALTER TABLE "orders" DROP COLUMN "quantity";
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'mug_product_id') THEN
    ALTER TABLE "orders" ADD COLUMN "mug_product_id" TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'orders' AND column_name = 'mug_product_snapshot') THEN
    ALTER TABLE "orders" ADD COLUMN "mug_product_snapshot" JSONB;
  END IF;
END $$;

-- DropTable (idempotent: only drop if exists)
DROP TABLE IF EXISTS "product_categories";

-- DropTable (idempotent: only drop if exists)
DROP TABLE IF EXISTS "products";

-- CreateTable (idempotent: only create if doesn't exist)
CREATE TABLE IF NOT EXISTS "mug_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "body_color_hex" TEXT NOT NULL DEFAULT '#f5f5f0',
    "handle_color_hex" TEXT NOT NULL DEFAULT '#a8a29e',
    "inner_color_hex" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "internal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "mug_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mug_products_is_active_idx') THEN
    CREATE INDEX "mug_products_is_active_idx" ON "mug_products"("is_active");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mug_products_is_fallback_idx') THEN
    CREATE INDEX "mug_products_is_fallback_idx" ON "mug_products"("is_fallback");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'mug_products_sort_order_idx') THEN
    CREATE INDEX "mug_products_sort_order_idx" ON "mug_products"("sort_order");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orders_mug_product_id_idx') THEN
    CREATE INDEX "orders_mug_product_id_idx" ON "orders"("mug_product_id");
  END IF;
END $$;

-- AddForeignKey (idempotent: only add if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'orders_mug_product_id_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent: only add if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                 WHERE constraint_name = 'mug_products_created_by_id_fkey') THEN
    ALTER TABLE "mug_products" ADD CONSTRAINT "mug_products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
