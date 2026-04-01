-- Product: price tiers (JSON), min quantity, lead time
ALTER TABLE "products" ADD COLUMN "price_tiers" JSONB;
ALTER TABLE "products" ADD COLUMN "min_quantity" INTEGER;
ALTER TABLE "products" ADD COLUMN "lead_time_days" TEXT;

-- ProductCategory: surcharges (JSON)
ALTER TABLE "product_categories" ADD COLUMN "surcharges" JSONB;
