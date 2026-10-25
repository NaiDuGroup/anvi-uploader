-- Unified stock stage 2: printers and their consumables (docs/UNIFIED-STOCK-PLAN.md).
-- Adds tables and seed rows; legacy ink / DTF consumable tables are left untouched.

-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_slots" (
    "id" TEXT NOT NULL,
    "printer_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "variant_id" TEXT,
    "share" DECIMAL(6,4),
    "sheets_per_unit" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "printer_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "printers_code_key" ON "printers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "printer_slots_printer_id_label_key" ON "printer_slots"("printer_id", "label");

-- AddForeignKey
ALTER TABLE "printer_slots" ADD CONSTRAINT "printer_slots_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_slots" ADD CONSTRAINT "printer_slots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "stock_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ─── Seed: consumable categories, printers, slots ───────────────────────────
-- Shares and toner yields are starting defaults; they are edited on the
-- «Принтеры» page. Idempotent: re-running finds existing rows by code / SKU.

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'ink',        'consumable', 'Cerneală',      'Чернила',      'Ink',        'ml',  100, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'toner',      'consumable', 'Toner',         'Тонер',        'Toner',      'pcs', 110, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dtf_film',   'consumable', 'Film DTF',      'Плёнка DTF',   'DTF film',   'm',   120, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dtf_powder', 'consumable', 'Pudră DTF',     'Порошок DTF',  'DTF powder', 'g',   130, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "printers" ("id", "code", "name", "technology", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'lf',    'Широкоформатный принтер', 'roll_solvent', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'uv',    'UV-принтер',              'uv',           20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'dtf',   'DTF-принтер',             'dtf',          30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ricoh', 'Ricoh C5200',             'toner_laser',  40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  r RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_printer_id TEXT;
  v_lf_avg NUMERIC;
BEGIN
  -- Wide-format ink keeps its last average cost as the price hint, so wide-format prices don't move.
  SELECT "avg_cost_per_ml_mdl" INTO v_lf_avg FROM "ink_inventory" WHERE "id" = 'large_format_roll';

  FOR r IN SELECT * FROM (VALUES
    -- printer, slot label, role, category, sku, name ru, name ro, name en, share, sort
    ('lf',    'Cyan',    'ink',    'ink',        'INK-LF-C',    'Чернила широкоформат Cyan',    'Cerneală mare format Cyan',    'Wide-format ink Cyan',    0.25::numeric,  1),
    ('lf',    'Magenta', 'ink',    'ink',        'INK-LF-M',    'Чернила широкоформат Magenta', 'Cerneală mare format Magenta', 'Wide-format ink Magenta', 0.25,  2),
    ('lf',    'Yellow',  'ink',    'ink',        'INK-LF-Y',    'Чернила широкоформат Yellow',  'Cerneală mare format Yellow',  'Wide-format ink Yellow',  0.25,  3),
    ('lf',    'Black',   'ink',    'ink',        'INK-LF-K',    'Чернила широкоформат Black',   'Cerneală mare format Black',   'Wide-format ink Black',   0.25,  4),
    ('uv',    'Cyan',    'ink',    'ink',        'INK-UV-C',    'Чернила UV Cyan',              'Cerneală UV Cyan',             'UV ink Cyan',             0.20,  1),
    ('uv',    'Magenta', 'ink',    'ink',        'INK-UV-M',    'Чернила UV Magenta',           'Cerneală UV Magenta',          'UV ink Magenta',          0.20,  2),
    ('uv',    'Yellow',  'ink',    'ink',        'INK-UV-Y',    'Чернила UV Yellow',            'Cerneală UV Yellow',           'UV ink Yellow',           0.20,  3),
    ('uv',    'Black',   'ink',    'ink',        'INK-UV-K',    'Чернила UV Black',             'Cerneală UV Black',            'UV ink Black',            0.20,  4),
    ('uv',    'White',   'ink',    'ink',        'INK-UV-W',    'Чернила UV White',             'Cerneală UV White',            'UV ink White',            0.15,  5),
    ('uv',    'Varnish', 'ink',    'ink',        'INK-UV-V',    'Лак UV',                       'Lac UV',                       'UV varnish',              0.05,  6),
    ('dtf',   'Cyan',    'ink',    'ink',        'INK-DTF-C',   'Чернила DTF Cyan',             'Cerneală DTF Cyan',            'DTF ink Cyan',            0.125, 1),
    ('dtf',   'Magenta', 'ink',    'ink',        'INK-DTF-M',   'Чернила DTF Magenta',          'Cerneală DTF Magenta',         'DTF ink Magenta',         0.125, 2),
    ('dtf',   'Yellow',  'ink',    'ink',        'INK-DTF-Y',   'Чернила DTF Yellow',           'Cerneală DTF Yellow',          'DTF ink Yellow',          0.125, 3),
    ('dtf',   'Black',   'ink',    'ink',        'INK-DTF-K',   'Чернила DTF Black',            'Cerneală DTF Black',           'DTF ink Black',           0.125, 4),
    ('dtf',   'White',   'ink',    'ink',        'INK-DTF-W',   'Чернила DTF White',            'Cerneală DTF White',           'DTF ink White',           0.5,   5),
    ('dtf',   'Плёнка',  'film',   'dtf_film',   'DTF-FILM',    'Плёнка DTF',                   'Film DTF',                     'DTF film',                NULL,  6),
    ('dtf',   'Порошок', 'powder', 'dtf_powder', 'DTF-POWDER',  'Порошок DTF',                  'Pudră DTF',                    'DTF powder',              NULL,  7),
    ('ricoh', 'Cyan',    'toner',  'toner',      'TONER-RICOH-C', 'Тонер Ricoh Cyan',           'Toner Ricoh Cyan',             'Ricoh toner Cyan',        NULL,  1),
    ('ricoh', 'Magenta', 'toner',  'toner',      'TONER-RICOH-M', 'Тонер Ricoh Magenta',        'Toner Ricoh Magenta',          'Ricoh toner Magenta',     NULL,  2),
    ('ricoh', 'Yellow',  'toner',  'toner',      'TONER-RICOH-Y', 'Тонер Ricoh Yellow',         'Toner Ricoh Yellow',           'Ricoh toner Yellow',      NULL,  3),
    ('ricoh', 'Black',   'toner',  'toner',      'TONER-RICOH-K', 'Тонер Ricoh Black',          'Toner Ricoh Black',            'Ricoh toner Black',       NULL,  4)
  ) AS t(printer, label, role, category, sku, name_ru, name_ro, name_en, share, sort)
  LOOP
    SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = r.category;
    SELECT "id" INTO v_printer_id FROM "printers" WHERE "code" = r.printer;

    SELECT "id" INTO v_item_id FROM "stock_items" WHERE "sku" = r.sku;
    IF v_item_id IS NULL THEN
      v_item_id := gen_random_uuid()::text;
      INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "sort_order", "updated_at")
      VALUES (v_item_id, v_category_id, r.sku, r.name_ro, r.name_ru, r.name_en, r.sort, CURRENT_TIMESTAMP);
    END IF;

    SELECT "id" INTO v_variant_id FROM "stock_variants" WHERE "sku" = r.sku;
    IF v_variant_id IS NULL THEN
      v_variant_id := gen_random_uuid()::text;
      INSERT INTO "stock_variants" ("id", "item_id", "sku", "purchase_cost", "updated_at")
      VALUES (
        v_variant_id, v_item_id, r.sku,
        CASE WHEN r.printer = 'lf' AND v_lf_avg > 0 THEN v_lf_avg ELSE NULL END,
        CURRENT_TIMESTAMP
      );
    END IF;

    INSERT INTO "printer_slots" ("id", "printer_id", "label", "role", "variant_id", "share", "sort_order")
    VALUES (gen_random_uuid()::text, v_printer_id, r.label, r.role, v_variant_id, r.share, r.sort)
    ON CONFLICT ("printer_id", "label") DO NOTHING;
  END LOOP;
END $$;

-- ─── Archive of the old wide-format ink tank ─────────────────────────────────
-- Its receipts and order movements move to one inactive item so the history
-- stays visible. A closing adjustment makes the movement sum match the old
-- balance (the legacy tank had no movement rows for receipts / manual edits).
DO $$
DECLARE
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_stock NUMERIC;
  v_avg NUMERIC;
  v_sum NUMERIC;
BEGIN
  IF EXISTS (SELECT 1 FROM "stock_items" WHERE "sku" = 'INK-LF-ARCHIVE') THEN
    RETURN;
  END IF;
  SELECT "stock_ml", "avg_cost_per_ml_mdl" INTO v_stock, v_avg FROM "ink_inventory" WHERE "id" = 'large_format_roll';
  IF v_stock IS NULL THEN
    RETURN;
  END IF;

  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'ink';
  v_item_id := gen_random_uuid()::text;
  v_variant_id := gen_random_uuid()::text;

  INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "is_active", "sort_order", "legacy_kind", "legacy_id", "internal_notes", "updated_at")
  VALUES (v_item_id, v_category_id, 'INK-LF-ARCHIVE',
          'Cerneală mare format (arhivă până la 25.10.2026)',
          'Чернила широкоформат (архив до 25.10.2026)',
          'Wide-format ink (archive until 25.10.2026)',
          false, 999, 'ink', 'large_format_roll',
          'История общего бака чернил широкоформата до перехода на учёт по цветам.',
          CURRENT_TIMESTAMP);

  INSERT INTO "stock_variants" ("id", "item_id", "sku", "stock_quantity", "avg_cost", "is_active", "updated_at")
  VALUES (v_variant_id, v_item_id, 'INK-LF-ARCHIVE', v_stock, v_avg, false, CURRENT_TIMESTAMP);

  -- Receipts (+ a RECEIPT movement each, which the legacy tank did not store).
  WITH moved AS (
    INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                  "note", "purchase_invoice_line_id", "is_provisional", "amounts_include_vat",
                                  "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', r."quantity_ml", r."total_cost_mdl", r."purchased_at",
           r."note", NULL, r."is_provisional", r."amounts_include_vat", r."created_by_id", r."created_at"
    FROM "ink_stock_receipts" r WHERE r."ink_inventory_id" = 'large_format_roll'
    RETURNING "id", "quantity", "total_cost_mdl", "created_by_id", "created_at"
  )
  INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl", "receipt_id", "created_by_id", "created_at")
  SELECT gen_random_uuid()::text, v_variant_id, 'main', m."quantity", 'RECEIPT', m."total_cost_mdl", m."id", m."created_by_id", m."created_at"
  FROM moved m;

  -- Order sales / returns / backlog.
  INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                 "order_id", "order_number", "order_line_id", "note", "created_by_id", "created_at")
  SELECT gen_random_uuid()::text, v_variant_id, 'main', m."quantity_ml", m."kind", m."ink_cost_mdl",
         m."order_id", m."order_number", m."order_line_id", m."note", m."created_by_id", m."created_at"
  FROM "ink_stock_movements" m WHERE m."ink_inventory_id" = 'large_format_roll';

  SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
  IF v_sum <> v_stock THEN
    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
    VALUES (gen_random_uuid()::text, v_variant_id, 'main', v_stock - v_sum, 'INVENTORY_ADJUSTMENT',
            'Сверка при переносе: в старом учёте приходы и ручные правки не писались в движения', CURRENT_TIMESTAMP);
  END IF;
END $$;
