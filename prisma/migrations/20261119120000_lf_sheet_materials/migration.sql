-- Wide-format materials sold as sheets (VATMAN A1 61×86): form roll | sheet, sheet size,
-- margin and price per sheet. Existing rows stay rolls. Additive only.
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "material_form" TEXT NOT NULL DEFAULT 'roll';
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "sheet_width_cm" DECIMAL(8,2);
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "sheet_height_cm" DECIMAL(8,2);
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "sheet_margin_mm" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "retail_price_per_sheet" INTEGER;
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "dealer_price_per_sheet" INTEGER;
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "avg_purchase_cost_per_sheet" DECIMAL(14,4);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'large_format_materials_material_form_check') THEN
    ALTER TABLE "large_format_materials"
      ADD CONSTRAINT "large_format_materials_material_form_check" CHECK ("material_form" IN ('roll', 'sheet'));
  END IF;
END $$;

-- Stock of sheet materials is counted in sheets: their variants live in this category.
INSERT INTO "stock_categories" ("id", "code", "kind", "name_ro", "name_ru", "name_en", "unit", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'lf_sheet_media', 'material', 'Materiale de format mare în foi', 'Широкоформатные листы', 'Large-format sheets', 'sheet', 55, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
