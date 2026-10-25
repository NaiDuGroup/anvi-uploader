-- Unified stock stage 3b: notebooks move into the «Блокноты» category (docs/UNIFIED-STOCK-PLAN.md).
-- Data only; legacy notebook tables are left untouched (dropped in the cleanup stage).

INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'notebooks', 'product', 'Caiete', 'Блокноты', 'Notebooks', 'pcs', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  p RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_sum NUMERIC;
BEGIN
  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'notebooks';

  FOR p IN SELECT * FROM "notebook_products" ORDER BY "sort_order", "sku" LOOP
    IF EXISTS (SELECT 1 FROM "stock_items" WHERE "legacy_kind" = 'notebook' AND "legacy_id" = p."id") THEN
      CONTINUE;
    END IF;

    v_item_id := gen_random_uuid()::text;
    v_variant_id := gen_random_uuid()::text;

    INSERT INTO "stock_items" ("id", "category_id", "sku", "name_ro", "name_ru", "name_en", "image_url", "attributes",
                               "is_sellable", "is_active", "sort_order", "internal_notes", "legacy_kind", "legacy_id",
                               "created_at", "updated_at")
    VALUES (v_item_id, v_category_id, p."sku", p."name_ro", p."name_ru", p."name_en", p."image_url",
            jsonb_build_object(
              'coverColorHex', p."cover_color_hex",
              'strapColorHex', p."strap_color_hex",
              'bookmarkColorHex', p."bookmark_color_hex",
              'paperKind', p."paper_kind",
              'printWidthCm', p."print_width_cm",
              'printHeightCm', p."print_height_cm",
              'printDpi', p."print_dpi",
              'has3dPreview', p."has_3d_preview"
            ),
            true, p."is_active", p."sort_order", p."internal_notes", 'notebook', p."id",
            p."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_variants" ("id", "item_id", "sku", "options", "stock_quantity", "avg_cost", "purchase_cost",
                                  "sell_price", "dealer_price", "is_active", "created_at", "updated_at")
    VALUES (v_variant_id, v_item_id, p."sku", jsonb_build_object('colorHex', p."cover_color_hex"),
            p."stock_quantity", p."avg_purchase_cost", p."purchase_cost",
            p."sell_price", p."dealer_price", p."is_active", p."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                  "supplier_name", "note", "purchase_invoice_line_id", "is_provisional",
                                  "amounts_include_vat", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', r."quantity", r."total_cost_mdl", r."purchased_at",
           r."supplier", r."note", NULL, r."is_provisional", r."amounts_include_vat", r."created_by_id", r."created_at"
    FROM "notebook_stock_receipts" r WHERE r."notebook_product_id" = p."id";

    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                   "order_id", "order_number", "note", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', m."delta",
           CASE m."kind" WHEN 'ORDER_STOCK_RETURN' THEN 'ORDER_RETURN' ELSE m."kind" END,
           m."cost_mdl", m."order_id", m."order_number", m."note", m."created_by_id", m."created_at"
    FROM "notebook_stock_movements" m WHERE m."notebook_product_id" = p."id";

    SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
    IF v_sum <> p."stock_quantity" THEN
      INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
      VALUES (gen_random_uuid()::text, v_variant_id, 'main', p."stock_quantity" - v_sum, 'INVENTORY_ADJUSTMENT',
              'Сверка при переносе блокнотов в единый склад: в старом учёте часть правок остатка не писалась в движения',
              CURRENT_TIMESTAMP);
    END IF;

    UPDATE "order_lines" SET "stock_variant_id" = v_variant_id WHERE "notebook_product_id" = p."id";
  END LOOP;
END $$;

UPDATE "supplier_item_mappings" m
SET "target_kind" = 'stock_variant', "target_id" = v."id"
FROM "stock_items" i
JOIN "stock_variants" v ON v."item_id" = i."id"
WHERE m."target_kind" = 'notebook' AND i."legacy_kind" = 'notebook' AND i."legacy_id" = m."target_id";
