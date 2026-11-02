-- DTF pricing, one rule (agreed with the owner 2026-11-02): a stock item is
-- priced bare and the print comes from the price list (T-shirt 100 + A4 180 =
-- «Tricou (A4)» 280). Caps and socks stay sets with a logo included.
-- * T-shirts priced the old way (with A4 inside: 280… or 350…) move to the bare
--   T-shirt: 100 / 95 / 85 / 70 retail, 100 dealer (dealer + A4 80 = 180).
-- * A «Кепки» category (DTF); the ERIS caps filed under «Одежда» move there with
--   the «Chipiu» set prices (logo included): 180 / 150 / 118 / 100, dealer 100.
-- Idempotent.

UPDATE "stock_variants" sv
SET "price_tiers" = '[{"minQty":1,"priceMdl":100},{"minQty":2,"priceMdl":95},{"minQty":10,"priceMdl":85},{"minQty":50,"priceMdl":70}]'::jsonb,
    "sell_price" = CASE WHEN sv."sell_price" IN (280, 350) THEN 100 ELSE sv."sell_price" END,
    "dealer_price" = CASE WHEN sv."dealer_price" = 180 THEN 100 ELSE sv."dealer_price" END,
    "updated_at" = CURRENT_TIMESTAMP
FROM "stock_items" i
JOIN "stock_categories" c ON c."id" = i."category_id"
WHERE sv."item_id" = i."id"
  AND c."code" = 'tshirts'
  AND jsonb_typeof(sv."price_tiers") = 'array'
  AND jsonb_array_length(sv."price_tiers") = 4
  AND (sv."price_tiers"->0->>'priceMdl')::numeric IN (280, 350);

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "print_methods", "sort_order", "is_active", "updated_at")
VALUES (gen_random_uuid()::text, 'caps', 'product', 'Șepci', 'Кепки', 'Caps', 'pcs', ARRAY['dtf'], 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "stock_items" i
SET "category_id" = caps."id",
    "updated_at" = CURRENT_TIMESTAMP
FROM "stock_categories" caps, "stock_categories" cur
WHERE caps."code" = 'caps'
  AND cur."id" = i."category_id"
  AND cur."code" <> 'caps'
  AND (i."name_ro" ~* '\mERIS\M' OR i."name_ru" ~* '\mERIS\M' OR i."name_en" ~* '\mERIS\M');

UPDATE "stock_variants" sv
SET "price_tiers" = '[{"minQty":1,"priceMdl":180},{"minQty":2,"priceMdl":150},{"minQty":10,"priceMdl":118},{"minQty":50,"priceMdl":100}]'::jsonb,
    "sell_price" = 180,
    "dealer_price" = 100,
    "updated_at" = CURRENT_TIMESTAMP
FROM "stock_items" i
JOIN "stock_categories" c ON c."id" = i."category_id"
WHERE sv."item_id" = i."id"
  AND c."code" = 'caps'
  AND (i."name_ro" ~* '\mERIS\M' OR i."name_ru" ~* '\mERIS\M' OR i."name_en" ~* '\mERIS\M')
  AND (sv."price_tiers" IS NULL OR (sv."price_tiers"->0->>'priceMdl')::numeric <> 180);
