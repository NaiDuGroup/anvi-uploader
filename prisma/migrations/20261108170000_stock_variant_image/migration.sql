-- Photo per stock variant (colour): storage key under `catalog/stock/`; NULL = the item photo. Additive only.
ALTER TABLE "stock_variants" ADD COLUMN "image_url" TEXT;
