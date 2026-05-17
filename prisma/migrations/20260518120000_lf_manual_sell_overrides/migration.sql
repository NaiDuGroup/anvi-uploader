-- Nullable manual overrides for LF catalog sell rates (MDL per linear m).
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "manual_final_retail_price_per_lm" INTEGER;
ALTER TABLE "large_format_materials" ADD COLUMN IF NOT EXISTS "manual_final_dealer_price_per_lm" INTEGER;
