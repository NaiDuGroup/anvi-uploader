-- A3+-only sheet papers (textured, sheet 32×45): price per A3+ sheet printed on both sides; NULL = one-side price × 2. Additive only.
ALTER TABLE "sheet_papers" ADD COLUMN IF NOT EXISTS "retail_price_two_sides_per_sheet" INTEGER;
ALTER TABLE "sheet_papers" ADD COLUMN IF NOT EXISTS "dealer_price_two_sides_per_sheet" INTEGER;
