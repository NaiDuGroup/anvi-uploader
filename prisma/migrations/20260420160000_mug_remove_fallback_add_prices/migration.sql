-- Remove fallback flag; add retail / dealer prices (whole currency units, nullable).

DROP INDEX IF EXISTS "mug_products_is_fallback_idx";

ALTER TABLE "mug_products" DROP COLUMN IF EXISTS "is_fallback";

ALTER TABLE "mug_products" ADD COLUMN "sell_price" INTEGER;
ALTER TABLE "mug_products" ADD COLUMN "dealer_price" INTEGER;
