-- Epson L1800 (sublimation: mugs, pillows, puzzles, keychains, clocks, mouse pads)
-- with its consumables: 6 sublimation inks, sublimation paper, thermal tape.
-- See docs/PRINT-METHODS-PLAN.md, stage A. Data only; idempotent.

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'sublimation_paper', 'consumable', 'Hârtie de sublimare', 'Сублимационная бумага', 'Sublimation paper', 'sheet', 140, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'thermal_tape',      'consumable', 'Bandă termică',       'Термоскотч',            'Thermal tape',      'm',     150, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "printers" ("id", "code", "name", "technology", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'subl', 'Epson L1800 (сублимация)', 'sublimation', 50, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  r RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_printer_id TEXT;
BEGIN
  SELECT "id" INTO v_printer_id FROM "printers" WHERE "code" = 'subl';

  FOR r IN SELECT * FROM (VALUES
    -- slot label, role, category, sku, name ru, name ro, name en, share, sort
    ('Cyan',          'ink',   'ink',               'INK-SUBL-C',  'Сублимационные чернила Cyan',          'Cerneală de sublimare Cyan',          'Sublimation ink Cyan',          0.2::numeric, 1),
    ('Magenta',       'ink',   'ink',               'INK-SUBL-M',  'Сублимационные чернила Magenta',       'Cerneală de sublimare Magenta',       'Sublimation ink Magenta',       0.2, 2),
    ('Yellow',        'ink',   'ink',               'INK-SUBL-Y',  'Сублимационные чернила Yellow',        'Cerneală de sublimare Yellow',        'Sublimation ink Yellow',        0.2, 3),
    ('Black',         'ink',   'ink',               'INK-SUBL-K',  'Сублимационные чернила Black',         'Cerneală de sublimare Black',         'Sublimation ink Black',         0.2, 4),
    ('Light Cyan',    'ink',   'ink',               'INK-SUBL-LC', 'Сублимационные чернила Light Cyan',    'Cerneală de sublimare Light Cyan',    'Sublimation ink Light Cyan',    0.1, 5),
    ('Light Magenta', 'ink',   'ink',               'INK-SUBL-LM', 'Сублимационные чернила Light Magenta', 'Cerneală de sublimare Light Magenta', 'Sublimation ink Light Magenta', 0.1, 6),
    ('Бумага',        'paper', 'sublimation_paper', 'SUBL-PAPER-A4', 'Сублимационная бумага A4',           'Hârtie de sublimare A4',              'Sublimation paper A4',          NULL, 7),
    ('Термоскотч',    'tape',  'thermal_tape',      'SUBL-TAPE',   'Термоскотч',                           'Bandă termică',                       'Thermal tape',                  NULL, 8)
  ) AS t(label, role, category, sku, name_ru, name_ro, name_en, share, sort)
  LOOP
    SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = r.category;

    SELECT "id" INTO v_item_id FROM "stock_items" WHERE "sku" = r.sku;
    IF v_item_id IS NULL THEN
      v_item_id := gen_random_uuid()::text;
      INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "sort_order", "updated_at")
      VALUES (v_item_id, v_category_id, r.sku, r.name_ro, r.name_ru, r.name_en, r.sort, CURRENT_TIMESTAMP);
    END IF;

    SELECT "id" INTO v_variant_id FROM "stock_variants" WHERE "sku" = r.sku;
    IF v_variant_id IS NULL THEN
      v_variant_id := gen_random_uuid()::text;
      INSERT INTO "stock_variants" ("id", "item_id", "sku", "updated_at")
      VALUES (v_variant_id, v_item_id, r.sku, CURRENT_TIMESTAMP);
    END IF;

    INSERT INTO "printer_slots" ("id", "printer_id", "label", "role", "variant_id", "share", "sort_order")
    VALUES (gen_random_uuid()::text, v_printer_id, r.label, r.role, v_variant_id, r.share, r.sort)
    ON CONFLICT ("printer_id", "label") DO NOTHING;
  END LOOP;
END $$;
