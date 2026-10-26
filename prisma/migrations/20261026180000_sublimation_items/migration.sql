-- Sublimation (docs/PRINT-METHODS-PLAN.md, stage D): blanks printed on the Epson L1800.
-- Categories, items and run-size prices from the studio price list (ANVI PriceList.pdf,
-- pages 15, 22–24). Stock starts at 0 and costs are unknown until receipts.
-- Idempotent (skips existing codes / SKUs).

INSERT INTO "print_methods" ("code", "name_ro", "name_ru", "name_en", "printer_code", "settings", "sort_order", "updated_at")
VALUES ('sublimation', 'Sublimare', 'Сублимация', 'Sublimation', 'subl', '{}'::jsonb, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "print_methods", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'pillows',    'product', 'Perne',          'Подушки',          'Pillows',     'pcs', ARRAY['sublimation']::TEXT[], 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'puzzles',    'product', 'Puzzle',         'Пазлы',            'Puzzles',     'pcs', ARRAY['sublimation']::TEXT[], 31, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'keychains',  'product', 'Brelocuri',      'Брелоки',          'Keychains',   'pcs', ARRAY['sublimation']::TEXT[], 32, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'clocks',     'product', 'Ceasuri',        'Часы',             'Clocks',      'pcs', ARRAY['sublimation']::TEXT[], 33, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'mouse_pads', 'product', 'Mousepad-uri',   'Коврики для мыши', 'Mouse pads',  'pcs', ARRAY['sublimation']::TEXT[], 34, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "stock_categories"
SET "print_methods" = array_append("print_methods", 'sublimation'), "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'mugs' AND NOT ('sublimation' = ANY("print_methods"));

DO $$
DECLARE
  r RECORD;
  v_cat TEXT;
  v_item TEXT;
BEGIN
  -- Items: category, item sku, names ru/ro/en, sort
  FOR r IN SELECT * FROM (VALUES
    ('pillows',   'PILLOW',        'Подушка',            'Pernă',           'Pillow',          1),
    ('puzzles',   'PUZZLE',        'Пазл',               'Puzzle',          'Puzzle',          1),
    ('puzzles',   'PUZZLE-MAGNET', 'Пазл магнитный',     'Puzzle magnetic', 'Magnetic puzzle', 2),
    ('clocks',    'CLOCK',         'Часы',               'Ceas',            'Clock',           1),
    ('keychains', 'MB001', 'Брелок mb001', 'Breloc mb001', 'Keychain mb001', 1),
    ('keychains', 'MB002', 'Брелок mb002', 'Breloc mb002', 'Keychain mb002', 2),
    ('keychains', 'MB003', 'Брелок mb003', 'Breloc mb003', 'Keychain mb003', 3),
    ('keychains', 'MB004', 'Брелок mb004', 'Breloc mb004', 'Keychain mb004', 4),
    ('keychains', 'MB005', 'Брелок mb005', 'Breloc mb005', 'Keychain mb005', 5),
    ('keychains', 'MB006', 'Брелок mb006', 'Breloc mb006', 'Keychain mb006', 6),
    ('keychains', 'MB007', 'Брелок mb007', 'Breloc mb007', 'Keychain mb007', 7),
    ('keychains', 'MB008', 'Брелок mb008', 'Breloc mb008', 'Keychain mb008', 8),
    ('keychains', 'MB009', 'Брелок mb009', 'Breloc mb009', 'Keychain mb009', 9),
    ('keychains', 'MB010', 'Брелок mb010', 'Breloc mb010', 'Keychain mb010', 10)
  ) AS t(cat, sku, name_ru, name_ro, name_en, sort)
  LOOP
    SELECT "id" INTO v_cat FROM "stock_categories" WHERE "code" = r.cat;
    IF NOT EXISTS (SELECT 1 FROM "stock_items" WHERE "sku" = r.sku) THEN
      INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "is_sellable", "sort_order", "updated_at")
      VALUES (gen_random_uuid()::text, v_cat, r.sku, r.name_ro, r.name_ru, r.name_en, true, r.sort, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;

  -- Variants: item sku, variant sku, label, options, tiers (price list), sort
  FOR r IN SELECT * FROM (VALUES
    ('PILLOW', 'PILLOW-SATIN',    'Сатин',    '{"material":"satin"}',    '[{"minQty":1,"priceMdl":280}]', 1),
    ('PILLOW', 'PILLOW-GABARDIN', 'Габардин', '{"material":"gabardine"}','[{"minQty":1,"priceMdl":300}]', 2),
    ('PILLOW', 'PILLOW-LINEN',    'Лён',      '{"material":"linen"}',    '[{"minQty":1,"priceMdl":320}]', 3),
    ('PILLOW', 'PILLOW-SEQUIN',   'Пайетки',  '{"material":"sequin"}',   '[{"minQty":1,"priceMdl":380}]', 4),
    ('PUZZLE', 'PUZZLE-A4-40',    'A4 19×25 · 40 дет.',  '{"size":"A4 19×25","pieces":40}',  '[{"minQty":1,"priceMdl":100}]', 1),
    ('PUZZLE', 'PUZZLE-A4-120',   'A4 21×30 · 120 дет.', '{"size":"A4 21×30","pieces":120}', '[{"minQty":1,"priceMdl":120}]', 2),
    ('PUZZLE', 'PUZZLE-A3-300',   'A3 30×42 · 300 дет.', '{"size":"A3 30×42","pieces":300}', '[{"minQty":1,"priceMdl":220}]', 3),
    ('PUZZLE', 'PUZZLE-HEART-17', 'Сердце 17×17 · 23 дет.', '{"size":"17×17","pieces":23}', '[{"minQty":1,"priceMdl":110}]', 4),
    ('PUZZLE', 'PUZZLE-HEART-19', 'Сердце 19×19 · 75 дет.', '{"size":"19×19","pieces":75}', '[{"minQty":1,"priceMdl":130}]', 5),
    ('PUZZLE-MAGNET', 'PUZZLE-MAGNET-A4', 'A4 21×30 · 126 дет.', '{"size":"A4 21×30","pieces":126}', '[{"minQty":1,"priceMdl":170}]', 1),
    ('PUZZLE-MAGNET', 'PUZZLE-MAGNET-A3', 'A3 27×31 · 210 дет.', '{"size":"A3 27×31","pieces":210}', '[{"minQty":1,"priceMdl":250}]', 2),
    ('CLOCK', 'CLOCK-35', '35×35 см', '{"size":"35×35"}', '[{"minQty":1,"priceMdl":410}]', 1),
    ('MB001', 'MB001', NULL, '{}', '[{"minQty":1,"priceMdl":100},{"minQty":2,"priceMdl":80},{"minQty":10,"priceMdl":65}]', 1),
    ('MB002', 'MB002', NULL, '{}', '[{"minQty":1,"priceMdl":110},{"minQty":2,"priceMdl":82},{"minQty":10,"priceMdl":68}]', 1),
    ('MB003', 'MB003', NULL, '{}', '[{"minQty":1,"priceMdl":130},{"minQty":2,"priceMdl":90},{"minQty":10,"priceMdl":75}]', 1),
    ('MB004', 'MB004', NULL, '{}', '[{"minQty":1,"priceMdl":130},{"minQty":2,"priceMdl":90},{"minQty":10,"priceMdl":75}]', 1),
    ('MB005', 'MB005', NULL, '{}', '[{"minQty":1,"priceMdl":130},{"minQty":2,"priceMdl":90},{"minQty":10,"priceMdl":75}]', 1),
    ('MB006', 'MB006', NULL, '{}', '[{"minQty":1,"priceMdl":110},{"minQty":2,"priceMdl":80},{"minQty":10,"priceMdl":65}]', 1),
    ('MB007', 'MB007', NULL, '{}', '[{"minQty":1,"priceMdl":70},{"minQty":2,"priceMdl":50},{"minQty":10,"priceMdl":45}]', 1),
    ('MB008', 'MB008', NULL, '{}', '[{"minQty":1,"priceMdl":130},{"minQty":2,"priceMdl":90},{"minQty":10,"priceMdl":75}]', 1),
    ('MB009', 'MB009', NULL, '{}', '[{"minQty":1,"priceMdl":130},{"minQty":2,"priceMdl":90},{"minQty":10,"priceMdl":75}]', 1),
    ('MB010', 'MB010', NULL, '{}', '[{"minQty":1,"priceMdl":120},{"minQty":2,"priceMdl":85},{"minQty":10,"priceMdl":70}]', 1)
  ) AS t(item_sku, sku, label, options, tiers, sort)
  LOOP
    SELECT "id" INTO v_item FROM "stock_items" WHERE "sku" = r.item_sku;
    IF NOT EXISTS (SELECT 1 FROM "stock_variants" WHERE "sku" = r.sku) THEN
      INSERT INTO "stock_variants" ("id", "item_id", "sku", "label", "options", "price_tiers", "sell_price", "sort_order", "updated_at")
      VALUES (gen_random_uuid()::text, v_item, r.sku, r.label, r.options::jsonb, r.tiers::jsonb,
              ((r.tiers::jsonb)->0->>'priceMdl')::numeric, r.sort, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;
