-- Unified LF catalog sell price per linear meter (retail + dealer).
ALTER TABLE "large_format_materials"
  ADD COLUMN "final_retail_price_per_lm" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "final_dealer_price_per_lm" INTEGER NOT NULL DEFAULT 0;

UPDATE "large_format_materials"
SET
  "final_retail_price_per_lm" = COALESCE("retail_price_per_lm", 0) + COALESCE("retail_print_price_per_lm", 0),
  "final_dealer_price_per_lm" = COALESCE("dealer_price_per_lm", 0) + COALESCE("dealer_print_price_per_lm", 0);
