-- Staff «ручная цена» per piece of a paper / mug / notebook / pen order line (additive, nullable).
ALTER TABLE "order_lines" ADD COLUMN "manual_unit_price_mdl" DOUBLE PRECISION;
