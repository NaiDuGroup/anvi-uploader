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
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_category_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_product_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";

-- DropIndex
DROP INDEX "orders_category_id_idx";

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "category_id",
DROP COLUMN "price_auto_calculated",
DROP COLUMN "price_tier",
DROP COLUMN "product_id",
DROP COLUMN "quantity",
ADD COLUMN     "mug_product_id" TEXT,
ADD COLUMN     "mug_product_snapshot" JSONB;

-- DropTable
DROP TABLE "product_categories";

-- DropTable
DROP TABLE "products";

-- CreateTable
CREATE TABLE "mug_products" (
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

-- CreateIndex
CREATE INDEX "mug_products_is_active_idx" ON "mug_products"("is_active");

-- CreateIndex
CREATE INDEX "mug_products_is_fallback_idx" ON "mug_products"("is_fallback");

-- CreateIndex
CREATE INDEX "mug_products_sort_order_idx" ON "mug_products"("sort_order");

-- CreateIndex
CREATE INDEX "orders_mug_product_id_idx" ON "orders"("mug_product_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_products" ADD CONSTRAINT "mug_products_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
