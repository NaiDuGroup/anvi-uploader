-- Unified stock stage 4: roll media and sheet paper balances/costs move into the unified stock.
-- Pricing settings stay on large_format_materials / sheet_papers, which now link to their variant.
-- Legacy stock columns and ledgers are left untouched (dropped in the cleanup stage).

-- AlterTable
ALTER TABLE "large_format_materials" ADD COLUMN     "stock_variant_id" TEXT;

-- AlterTable
ALTER TABLE "sheet_papers" ADD COLUMN     "stock_variant_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "large_format_materials_stock_variant_id_key" ON "large_format_materials"("stock_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_papers_stock_variant_id_key" ON "sheet_papers"("stock_variant_id");

-- AddForeignKey
ALTER TABLE "large_format_materials" ADD CONSTRAINT "large_format_materials_stock_variant_id_fkey" FOREIGN KEY ("stock_variant_id") REFERENCES "stock_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_papers" ADD CONSTRAINT "sheet_papers_stock_variant_id_fkey" FOREIGN KEY ("stock_variant_id") REFERENCES "stock_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;



INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'roll_media',  'material', 'Materiale de format mare', 'Широкоформатные материалы', 'Large-format materials', 'm',     50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'sheet_paper', 'material', 'Hârtie în foi',            'Листовая бумага',           'Sheet paper',            'sheet', 60, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ─── Roll media ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_sku TEXT;
  v_sum NUMERIC;
BEGIN
  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'roll_media';

  FOR r IN SELECT * FROM "large_format_materials" WHERE "stock_variant_id" IS NULL ORDER BY "sort_order", "name" LOOP
    v_item_id := gen_random_uuid()::text;
    v_variant_id := gen_random_uuid()::text;
    v_sku := 'ROLL-' || upper(substr(replace(r."id", '-', ''), 1, 8));

    INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "attributes",
                               "is_active", "sort_order", "legacy_kind", "legacy_id", "created_at", "updated_at")
    VALUES (v_item_id, v_category_id, v_sku, r."name", r."name", r."name",
            jsonb_build_object('rollWidthM', r."roll_width_m", 'rollLengthM', r."roll_length_m", 'printableWidthM', r."printable_width_m"),
            r."is_active", r."sort_order", 'lf_material', r."id", r."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_variants" ("id", "item_id", "sku", "stock_quantity", "avg_cost", "purchase_cost", "is_active", "created_at", "updated_at")
    VALUES (v_variant_id, v_item_id, v_sku, r."stock_linear_m", r."avg_purchase_cost_per_lm", r."cost_per_lm", r."is_active", r."created_at", CURRENT_TIMESTAMP);

    -- Receipts (+ a RECEIPT movement each — the legacy roll ledger kept receipts out of movements).
    WITH moved AS (
      INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                    "supplier_name", "note", "purchase_invoice_line_id", "is_provisional",
                                    "amounts_include_vat", "created_by_id", "created_at")
      SELECT gen_random_uuid()::text, v_variant_id, 'main', x."quantity_lm", x."total_cost_mdl", x."purchased_at",
             x."supplier", x."note", NULL, x."is_provisional", x."amounts_include_vat", x."created_by_id", x."created_at"
      FROM "lf_roll_stock_receipts" x WHERE x."material_id" = r."id"
      RETURNING "id", "quantity", "total_cost_mdl", "created_by_id", "created_at"
    )
    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl", "receipt_id", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', m."quantity", 'RECEIPT', m."total_cost_mdl", m."id", m."created_by_id", m."created_at"
    FROM moved m;

    -- Order sales / returns / backlog / layout transfers.
    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                   "order_id", "order_number", "order_line_id", "note", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', x."quantity_lm", x."kind", x."material_cost_mdl",
           x."order_id", x."order_number", x."order_line_id", x."note", x."created_by_id", x."created_at"
    FROM "lf_roll_stock_movements" x WHERE x."material_id" = r."id";

    SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
    IF v_sum <> r."stock_linear_m" THEN
      INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
      VALUES (gen_random_uuid()::text, v_variant_id, 'main', r."stock_linear_m" - v_sum, 'INVENTORY_ADJUSTMENT',
              'Сверка при переносе рулонов в единый склад: в старом учёте часть правок остатка не писалась в движения',
              CURRENT_TIMESTAMP);
    END IF;

    UPDATE "large_format_materials" SET "stock_variant_id" = v_variant_id WHERE "id" = r."id";
    UPDATE "order_lines" SET "stock_variant_id" = v_variant_id
    WHERE "large_format_material_id" = r."id" AND "stock_variant_id" IS NULL;
  END LOOP;
END $$;

-- ─── Sheet paper ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_sku TEXT;
  v_sum NUMERIC;
BEGIN
  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'sheet_paper';

  FOR r IN SELECT * FROM "sheet_papers" WHERE "stock_variant_id" IS NULL ORDER BY "sort_order", "name" LOOP
    v_item_id := gen_random_uuid()::text;
    v_variant_id := gen_random_uuid()::text;
    v_sku := 'PAPER-' || upper(substr(replace(r."id", '-', ''), 1, 8));

    INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "attributes",
                               "is_active", "sort_order", "legacy_kind", "legacy_id", "created_at", "updated_at")
    VALUES (v_item_id, v_category_id, v_sku, r."name", r."name", r."name",
            jsonb_build_object('sheetWidthCm', r."sheet_width_cm", 'sheetHeightCm', r."sheet_height_cm", 'gsm', r."gsm"),
            r."is_active", r."sort_order", 'sheet_paper', r."id", r."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_variants" ("id", "item_id", "sku", "stock_quantity", "avg_cost", "purchase_cost", "is_active", "created_at", "updated_at")
    VALUES (v_variant_id, v_item_id, v_sku, r."stock_sheets", r."avg_purchase_cost_per_sheet", r."cost_per_sheet", r."is_active", r."created_at", CURRENT_TIMESTAMP);

    WITH moved AS (
      INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                    "supplier_name", "note", "purchase_invoice_line_id", "is_provisional",
                                    "amounts_include_vat", "created_by_id", "created_at")
      SELECT gen_random_uuid()::text, v_variant_id, 'main', x."quantity_sheets", x."total_cost_mdl", x."purchased_at",
             x."supplier", x."note", NULL, x."is_provisional", x."amounts_include_vat", x."created_by_id", x."created_at"
      FROM "sheet_paper_stock_receipts" x WHERE x."sheet_paper_id" = r."id"
      RETURNING "id", "quantity", "total_cost_mdl", "created_by_id", "created_at"
    )
    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl", "receipt_id", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', m."quantity", 'RECEIPT', m."total_cost_mdl", m."id", m."created_by_id", m."created_at"
    FROM moved m;

    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                   "order_id", "order_number", "order_line_id", "note", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', x."quantity_sheets", x."kind", x."paper_cost_mdl",
           x."order_id", x."order_number", x."order_line_id", x."note", x."created_by_id", x."created_at"
    FROM "sheet_paper_stock_movements" x WHERE x."sheet_paper_id" = r."id";

    SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
    IF v_sum <> r."stock_sheets" THEN
      INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
      VALUES (gen_random_uuid()::text, v_variant_id, 'main', r."stock_sheets" - v_sum, 'INVENTORY_ADJUSTMENT',
              'Сверка при переносе листовой бумаги в единый склад', CURRENT_TIMESTAMP);
    END IF;

    UPDATE "sheet_papers" SET "stock_variant_id" = v_variant_id WHERE "id" = r."id";
    UPDATE "order_lines" SET "stock_variant_id" = v_variant_id
    WHERE "sheet_paper_id" = r."id" AND "stock_variant_id" IS NULL;
  END LOOP;
END $$;

UPDATE "supplier_item_mappings" m
SET "target_kind" = 'stock_variant', "target_id" = v."id"
FROM "large_format_materials" lf
JOIN "stock_variants" v ON v."id" = lf."stock_variant_id"
WHERE m."target_kind" = 'lf_material' AND m."target_id" = lf."id";

UPDATE "supplier_item_mappings" m
SET "target_kind" = 'stock_variant', "target_id" = v."id"
FROM "sheet_papers" sp
JOIN "stock_variants" v ON v."id" = sp."stock_variant_id"
WHERE m."target_kind" = 'sheet_paper' AND m."target_id" = sp."id";
