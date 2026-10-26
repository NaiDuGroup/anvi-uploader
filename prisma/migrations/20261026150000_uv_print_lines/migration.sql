-- UV print order lines (docs/PRINT-METHODS-PLAN.md, stage C).

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "uv_line_data" JSONB;



-- Pens and notebooks can also be picked as «Наше изделие» in a UV print line.
UPDATE "stock_categories"
SET "print_methods" = array_append("print_methods", 'uv'), "updated_at" = CURRENT_TIMESTAMP
WHERE "code" IN ('pens', 'notebooks') AND NOT ('uv' = ANY("print_methods"));
