-- Unified stock: DTF prints on items from flagged categories (docs/UNIFIED-STOCK-PLAN.md).
ALTER TABLE "stock_categories" ADD COLUMN "print_methods" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "stock_variants" ADD COLUMN "price_tiers" JSONB;

-- Socks and bodysuits are printed with DTF; t-shirts get their own category.
UPDATE "stock_categories" SET "print_methods" = ARRAY['dtf']::TEXT[] WHERE "code" IN ('socks', 'bodysuits');

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "print_methods", "sort_order", "is_active", "updated_at")
VALUES (gen_random_uuid()::text, 'tshirts', 'product', 'Tricouri', 'Майки', 'T-shirts', 'pcs', ARRAY['dtf']::TEXT[], 5, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
