-- Unified stock stage 3c: mugs move into the «Кружки» category; designs link to stock variants.
-- Legacy mug tables are left untouched (dropped in the cleanup stage).

-- AlterTable
ALTER TABLE "designs" ADD COLUMN     "stock_variant_id" TEXT;

-- CreateIndex
CREATE INDEX "designs_stock_variant_id_idx" ON "designs"("stock_variant_id");

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_stock_variant_id_fkey" FOREIGN KEY ("stock_variant_id") REFERENCES "stock_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;



INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'mugs', 'product', 'Căni', 'Кружки', 'Mugs', 'pcs', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  p RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_sum NUMERIC;
BEGIN
  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'mugs';

  FOR p IN SELECT * FROM "mug_products" ORDER BY "sort_order", "sku" LOOP
    IF EXISTS (SELECT 1 FROM "stock_items" WHERE "legacy_kind" = 'mug' AND "legacy_id" = p."id") THEN
      CONTINUE;
    END IF;

    v_item_id := gen_random_uuid()::text;
    v_variant_id := gen_random_uuid()::text;

    INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "image_url", "attributes",
                               "is_sellable", "is_active", "sort_order", "internal_notes", "legacy_kind", "legacy_id",
                               "created_at", "updated_at")
    VALUES (v_item_id, v_category_id, p."sku", p."name_ro", p."name_ru", p."name_en", p."image_url",
            jsonb_build_object(
              'bodyColorHex', p."body_color_hex",
              'handleColorHex', p."handle_color_hex",
              'innerColorHex', p."inner_color_hex",
              'rimColorHex', p."rim_color_hex",
              'printWidthCm', p."print_width_cm",
              'printHeightCm', p."print_height_cm",
              'printDpi', p."print_dpi",
              'has3dPreview', p."has_3d_preview"
            ),
            true, p."is_active", p."sort_order", p."internal_notes", 'mug', p."id",
            p."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_variants" ("id", "item_id", "sku", "options", "stock_quantity", "avg_cost", "purchase_cost",
                                  "sell_price", "dealer_price", "is_active", "created_at", "updated_at")
    VALUES (v_variant_id, v_item_id, p."sku", jsonb_build_object('colorHex', p."body_color_hex"),
            p."stock_quantity", p."avg_purchase_cost", p."purchase_cost",
            p."sell_price", p."dealer_price", p."is_active", p."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                  "supplier_name", "note", "purchase_invoice_line_id", "is_provisional",
                                  "amounts_include_vat", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', r."quantity", r."total_cost_mdl", r."purchased_at",
           r."supplier", r."note", NULL, r."is_provisional", r."amounts_include_vat", r."created_by_id", r."created_at"
    FROM "mug_stock_receipts" r WHERE r."mug_product_id" = p."id";

    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                   "order_id", "order_number", "note", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', m."delta",
           CASE m."kind" WHEN 'ORDER_STOCK_RETURN' THEN 'ORDER_RETURN' ELSE m."kind" END,
           m."cost_mdl", m."order_id", m."order_number", m."note", m."created_by_id", m."created_at"
    FROM "mug_stock_movements" m WHERE m."mug_product_id" = p."id";

    SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
    IF v_sum <> p."stock_quantity" THEN
      INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
      VALUES (gen_random_uuid()::text, v_variant_id, 'main', p."stock_quantity" - v_sum, 'INVENTORY_ADJUSTMENT',
              'Сверка при переносе кружек в единый склад: в старом учёте часть правок остатка не писалась в движения',
              CURRENT_TIMESTAMP);
    END IF;

    UPDATE "order_lines" SET "stock_variant_id" = v_variant_id WHERE "mug_product_id" = p."id";
    UPDATE "designs" SET "stock_variant_id" = v_variant_id WHERE "mug_product_id" = p."id";
  END LOOP;
END $$;

-- Notebook designs (none today) also point at their variants.
UPDATE "designs" d
SET "stock_variant_id" = v."id"
FROM "stock_items" i
JOIN "stock_variants" v ON v."item_id" = i."id"
WHERE d."stock_variant_id" IS NULL AND d."notebook_product_id" IS NOT NULL
  AND i."legacy_kind" = 'notebook' AND i."legacy_id" = d."notebook_product_id";

UPDATE "supplier_item_mappings" m
SET "target_kind" = 'stock_variant', "target_id" = v."id"
FROM "stock_items" i
JOIN "stock_variants" v ON v."item_id" = i."id"
WHERE m."target_kind" = 'mug' AND i."legacy_kind" = 'mug' AND i."legacy_id" = m."target_id";
