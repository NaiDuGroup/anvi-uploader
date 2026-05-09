-- AlterTable: trilingual names, SKU code, stock quantity (replace single `name`)

ALTER TABLE "mug_products" ADD COLUMN "sku" TEXT;
ALTER TABLE "mug_products" ADD COLUMN "name_ro" TEXT;
ALTER TABLE "mug_products" ADD COLUMN "name_ru" TEXT;
ALTER TABLE "mug_products" ADD COLUMN "name_en" TEXT;
ALTER TABLE "mug_products" ADD COLUMN "stock_quantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "mug_products"
SET
  "name_ro" = "name",
  "name_ru" = "name",
  "name_en" = "name",
  "sku" = 'MIG-' || SUBSTRING(REPLACE("id"::text, '-', ''), 1, 12)
WHERE "sku" IS NULL;

ALTER TABLE "mug_products" DROP COLUMN "name";

ALTER TABLE "mug_products" ALTER COLUMN "sku" SET NOT NULL;
ALTER TABLE "mug_products" ALTER COLUMN "name_ro" SET NOT NULL;
ALTER TABLE "mug_products" ALTER COLUMN "name_ru" SET NOT NULL;
ALTER TABLE "mug_products" ALTER COLUMN "name_en" SET NOT NULL;

CREATE UNIQUE INDEX "mug_products_sku_key" ON "mug_products"("sku");
