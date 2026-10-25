-- Unified stock stage 3a: pens move into the «Ручки» category (docs/UNIFIED-STOCK-PLAN.md).
-- Legacy pen tables are left untouched (dropped in the cleanup stage).

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "stock_variant_id" TEXT;

-- CreateIndex
CREATE INDEX "order_lines_stock_variant_id_idx" ON "order_lines"("stock_variant_id");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_stock_variant_id_fkey" FOREIGN KEY ("stock_variant_id") REFERENCES "stock_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ─── «Ручки» category and one item + one variant per legacy pen ──────────────
INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'pens', 'product', 'Pixuri', 'Ручки', 'Pens', 'pcs', 3, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
  p RECORD;
  v_category_id TEXT;
  v_item_id TEXT;
  v_variant_id TEXT;
  v_sum NUMERIC;
BEGIN
  SELECT "id" INTO v_category_id FROM "stock_categories" WHERE "code" = 'pens';

  FOR p IN SELECT * FROM "pen_products" ORDER BY "sort_order", "sku" LOOP
    -- Idempotent: skip pens already moved.
    IF EXISTS (SELECT 1 FROM "stock_items" WHERE "legacy_kind" = 'pen' AND "legacy_id" = p."id") THEN
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
              'clipColorHex', p."clip_color_hex",
              'printWidthCm', p."print_width_cm",
              'printHeightCm', p."print_height_cm",
              'printDpi', p."print_dpi",
              'has3dPreview', p."has_3d_preview"
            ),
            true, p."is_active", p."sort_order", p."internal_notes", 'pen', p."id",
            p."created_at", CURRENT_TIMESTAMP);

    INSERT INTO "stock_variants" ("id", "item_id", "sku", "options", "stock_quantity", "avg_cost", "purchase_cost",
                                  "sell_price", "dealer_price", "is_active", "created_at", "updated_at")
    VALUES (v_variant_id, v_item_id, p."sku", jsonb_build_object('colorHex', p."body_color_hex"),
            p."stock_quantity", p."avg_purchase_cost", p."purchase_cost",
            p."sell_price", p."dealer_price", p."is_active", p."created_at", CURRENT_TIMESTAMP);

    -- Receipts with their e-Factura links (none in production today, kept for completeness).
    INSERT INTO "stock_receipts" ("id", "variant_id", "location_id", "quantity", "total_cost_mdl", "purchased_at",
                                  "supplier_name", "note", "purchase_invoice_line_id", "is_provisional",
                                  "amounts_include_vat", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', r."quantity", r."total_cost_mdl", r."purchased_at",
           r."supplier", r."note", NULL, r."is_provisional", r."amounts_include_vat", r."created_by_id", r."created_at"
    FROM "pen_stock_receipts" r WHERE r."pen_product_id" = p."id";

    -- Movements (receipts, order sales/returns, stocktakes). Legacy return kind is renamed.
    INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "cost_mdl",
                                   "order_id", "order_number", "note", "created_by_id", "created_at")
    SELECT gen_random_uuid()::text, v_variant_id, 'main', m."delta",
           CASE m."kind" WHEN 'ORDER_STOCK_RETURN' THEN 'ORDER_RETURN' ELSE m."kind" END,
           m."cost_mdl", m."order_id", m."order_number", m."note", m."created_by_id", m."created_at"
    FROM "pen_stock_movements" m WHERE m."pen_product_id" = p."id";

    -- Close any gap between the old balance and the movement sum.
    SELECT COALESCE(SUM("delta"), 0) INTO v_sum FROM "stock_movements" WHERE "variant_id" = v_variant_id;
    IF v_sum <> p."stock_quantity" THEN
      INSERT INTO "stock_movements" ("id", "variant_id", "location_id", "delta", "kind", "note", "created_at")
      VALUES (gen_random_uuid()::text, v_variant_id, 'main', p."stock_quantity" - v_sum, 'INVENTORY_ADJUSTMENT',
              'Сверка при переносе ручек в единый склад', CURRENT_TIMESTAMP);
    END IF;

    -- Existing order lines point at the new variant.
    UPDATE "order_lines" SET "stock_variant_id" = v_variant_id WHERE "pen_product_id" = p."id";
  END LOOP;
END $$;

-- e-Factura rules that targeted a pen now target its variant.
UPDATE "supplier_item_mappings" m
SET "target_kind" = 'stock_variant', "target_id" = v."id"
FROM "stock_items" i
JOIN "stock_variants" v ON v."item_id" = i."id"
WHERE m."target_kind" = 'pen' AND i."legacy_kind" = 'pen' AND i."legacy_id" = m."target_id";
