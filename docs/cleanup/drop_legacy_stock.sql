-- Этап 5 «Уборка»: удаление старого учёта склада.
-- НЕ применять до выкладки этапов 1–4 и ~месяца работы без расхождений.
-- Порядок и проверки — docs/cleanup/README.md. Этот файл становится migration.sql
-- новой папки в prisma/migrations/ (вместе с правкой schema.prisma и code.patch).
--
-- Удаление колонки удаляет и её внешний ключ / индексы; удаление таблицы —
-- её индексы (в т.ч. ручной ink_stock_receipts_ink_inventory_id_idx).

-- 1) Старые ссылки строк заказов, заказов и дизайнов на каталоги кружек / блокнотов / ручек.
--    Все перенесённые строки держат stock_variant_id (проверки 03–05 в checks.sql).
ALTER TABLE "order_lines"
  DROP COLUMN IF EXISTS "mug_product_id",
  DROP COLUMN IF EXISTS "notebook_product_id",
  DROP COLUMN IF EXISTS "pen_product_id";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "mug_product_id",
  DROP COLUMN IF EXISTS "notebook_product_id",
  DROP COLUMN IF EXISTS "pen_product_id";

ALTER TABLE "designs"
  DROP COLUMN IF EXISTS "mug_product_id",
  DROP COLUMN IF EXISTS "notebook_product_id";

-- 2) Старые остаток / себестоимость рулонов и бумаги (теперь на варианте единого склада).
ALTER TABLE "large_format_materials"
  DROP COLUMN IF EXISTS "stock_linear_m",
  DROP COLUMN IF EXISTS "avg_purchase_cost_per_lm",
  DROP COLUMN IF EXISTS "cost_per_lm";

ALTER TABLE "sheet_papers"
  DROP COLUMN IF EXISTS "stock_sheets",
  DROP COLUMN IF EXISTS "avg_purchase_cost_per_sheet",
  DROP COLUMN IF EXISTS "cost_per_sheet";

-- 3) Журналы движений и приходов (ссылаются на справочники ниже).
DROP TABLE IF EXISTS "mug_stock_movements";
DROP TABLE IF EXISTS "mug_stock_receipts";
DROP TABLE IF EXISTS "notebook_stock_movements";
DROP TABLE IF EXISTS "notebook_stock_receipts";
DROP TABLE IF EXISTS "pen_stock_movements";
DROP TABLE IF EXISTS "pen_stock_receipts";
DROP TABLE IF EXISTS "garment_stock_movements";
DROP TABLE IF EXISTS "garment_stock_receipts";
DROP TABLE IF EXISTS "dtf_consumable_movements";
DROP TABLE IF EXISTS "dtf_consumable_receipts";
DROP TABLE IF EXISTS "ink_stock_movements";
DROP TABLE IF EXISTS "ink_stock_receipts";
DROP TABLE IF EXISTS "lf_roll_stock_movements";
DROP TABLE IF EXISTS "lf_roll_stock_receipts";
DROP TABLE IF EXISTS "sheet_paper_stock_movements";
DROP TABLE IF EXISTS "sheet_paper_stock_receipts";

-- 4) Старые справочники (варианты одежды раньше моделей).
DROP TABLE IF EXISTS "garment_variants";
DROP TABLE IF EXISTS "garment_products";
DROP TABLE IF EXISTS "dtf_consumable_stock";
DROP TABLE IF EXISTS "ink_inventory";
DROP TABLE IF EXISTS "mug_products";
DROP TABLE IF EXISTS "notebook_products";
DROP TABLE IF EXISTS "pen_products";
