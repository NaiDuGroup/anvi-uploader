-- DTF price list 2026-11 (agreed with the owner):
-- * print formats: logo 10×10 retail 50 → 100; dealer prices logo / A6 40, A5 60,
--   A4 80, A3 120; A3 is also handed to dealers unpressed for 90;
-- * every stock item's price includes its standard print — A4 on T-shirts, polos,
--   hoodies, bodysuits; a logo up to 10×10 on caps and socks (code default, see
--   `dtfIncludedPrintFor`). Run-size prices stay the «Ofertă» ones; another print
--   size moves the price by the format difference. Dealer price of the item with
--   that print, where none is set: T-shirts etc. 180 (100 + A4 80), caps 100, socks 40;
-- * DTF norms from a year of purchases: powder 25 → 10 g/m, ink 14 → 15 ml/m (only
--   where the old defaults are stored); the dropped credit setting is removed.
-- Idempotent.

ALTER TABLE "print_price_presets" ADD COLUMN IF NOT EXISTS "dealer_no_press_price" DECIMAL(12,2);

UPDATE "print_price_presets" p
SET "retail_price" = CASE WHEN v.retail IS NULL THEN p."retail_price" ELSE v.retail END,
    "dealer_price" = v.dealer,
    "dealer_no_press_price" = v.no_press,
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  (10::numeric, 10::numeric, 100::numeric, 40::numeric, NULL::numeric),
  (10, 15, NULL, 40, NULL),
  (15, 21, NULL, 60, NULL),
  (21, 30, NULL, 80, NULL),
  (30, 42, NULL, 120, 90)
) AS v(a, b, retail, dealer, no_press)
WHERE p."method_code" = 'dtf'
  AND LEAST(p."width_cm", p."height_cm") = v.a
  AND GREATEST(p."width_cm", p."height_cm") = v.b;

UPDATE "print_methods"
SET "settings" = ("settings" - 'includedPrintCreditMdl')
  || CASE WHEN "settings"->>'powderGramsPerLinearMeter' = '25' THEN '{"powderGramsPerLinearMeter": 10}'::jsonb ELSE '{}'::jsonb END
  || CASE WHEN "settings"->>'inkMlPerLinearMeter' = '14' THEN '{"inkMlPerLinearMeter": 15}'::jsonb ELSE '{}'::jsonb END,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'dtf';

-- Dealer price of DTF items (category or item marked «dtf») that are sold with a price.
UPDATE "stock_variants" sv
SET "dealer_price" = CASE c."code" WHEN 'caps' THEN 100 WHEN 'socks' THEN 40 ELSE 180 END,
    "updated_at" = CURRENT_TIMESTAMP
FROM "stock_items" i
JOIN "stock_categories" c ON c."id" = i."category_id"
WHERE sv."item_id" = i."id"
  AND sv."dealer_price" IS NULL
  AND c."code" IN ('tshirts', 'polos', 'hoodies', 'bodysuits', 'caps', 'socks')
  AND ('dtf' = ANY(c."print_methods") OR 'dtf' = ANY(i."print_methods"))
  AND (sv."sell_price" IS NOT NULL OR jsonb_typeof(sv."price_tiers") = 'array');
