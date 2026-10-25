-- Этап 5 «Уборка»: проверки перед удалением старых таблиц и колонок склада.
-- Каждый запрос должен вернуть 0 строк. Любая строка = причина разобраться ДО drop.
-- Запуск: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/cleanup/checks.sql
-- Запросы только читают данные.

\echo '01 старые кружки / блокноты / ручки без позиции единого склада'
SELECT 'mug' AS kind, p.id, p.sku FROM mug_products p
WHERE NOT EXISTS (SELECT 1 FROM stock_items i JOIN stock_variants v ON v.item_id = i.id
                  WHERE i.legacy_kind = 'mug' AND i.legacy_id = p.id)
UNION ALL
SELECT 'notebook', p.id, p.sku FROM notebook_products p
WHERE NOT EXISTS (SELECT 1 FROM stock_items i JOIN stock_variants v ON v.item_id = i.id
                  WHERE i.legacy_kind = 'notebook' AND i.legacy_id = p.id)
UNION ALL
SELECT 'pen', p.id, p.sku FROM pen_products p
WHERE NOT EXISTS (SELECT 1 FROM stock_items i JOIN stock_variants v ON v.item_id = i.id
                  WHERE i.legacy_kind = 'pen' AND i.legacy_id = p.id);

\echo '02 рулоны / бумага без варианта единого склада'
SELECT 'large_format_materials' AS tbl, id, name FROM large_format_materials WHERE stock_variant_id IS NULL
UNION ALL
SELECT 'sheet_papers', id, name FROM sheet_papers WHERE stock_variant_id IS NULL;

\echo '03 строки заказов со старой ссылкой, но без stock_variant_id'
SELECT id, order_id, product_type, mug_product_id, notebook_product_id, pen_product_id
FROM order_lines
WHERE (mug_product_id IS NOT NULL OR notebook_product_id IS NOT NULL OR pen_product_id IS NOT NULL)
  AND stock_variant_id IS NULL;

\echo '04 заказы со старой ссылкой на товар, у которых ни одна строка не держит вариант'
SELECT o.id, o.order_number, o.product_type
FROM orders o
WHERE (o.mug_product_id IS NOT NULL OR o.notebook_product_id IS NOT NULL OR o.pen_product_id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id = o.id AND l.stock_variant_id IS NOT NULL);

\echo '05 дизайны со старой ссылкой, но без stock_variant_id'
SELECT id, title, target_type, mug_product_id, notebook_product_id
FROM designs
WHERE (mug_product_id IS NOT NULL OR notebook_product_id IS NOT NULL)
  AND stock_variant_id IS NULL;

\echo '06 записи в старых журналах ПОСЛЕ переноса своего вида (значит, их писал старый код)'
WITH m AS (
  -- created_at в журналах — UTC без зоны, finished_at — с зоной: приводим к UTC.
  SELECT migration_name, MAX(finished_at) AT TIME ZONE 'UTC' AS at FROM _prisma_migrations
  WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL GROUP BY migration_name
)
SELECT 'mug_stock_movements' AS tbl, COUNT(*) FROM mug_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025200000_unified_stock_mugs') HAVING COUNT(*) > 0
UNION ALL SELECT 'mug_stock_receipts', COUNT(*) FROM mug_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025200000_unified_stock_mugs') HAVING COUNT(*) > 0
UNION ALL SELECT 'notebook_stock_movements', COUNT(*) FROM notebook_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025190000_unified_stock_notebooks') HAVING COUNT(*) > 0
UNION ALL SELECT 'notebook_stock_receipts', COUNT(*) FROM notebook_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025190000_unified_stock_notebooks') HAVING COUNT(*) > 0
UNION ALL SELECT 'pen_stock_movements', COUNT(*) FROM pen_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025180000_unified_stock_pens') HAVING COUNT(*) > 0
UNION ALL SELECT 'pen_stock_receipts', COUNT(*) FROM pen_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025180000_unified_stock_pens') HAVING COUNT(*) > 0
UNION ALL SELECT 'ink_stock_movements', COUNT(*) FROM ink_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025160000_unified_stock_printers') HAVING COUNT(*) > 0
UNION ALL SELECT 'ink_stock_receipts', COUNT(*) FROM ink_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025160000_unified_stock_printers') HAVING COUNT(*) > 0
UNION ALL SELECT 'dtf_consumable_movements', COUNT(*) FROM dtf_consumable_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025160000_unified_stock_printers') HAVING COUNT(*) > 0
UNION ALL SELECT 'dtf_consumable_receipts', COUNT(*) FROM dtf_consumable_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025160000_unified_stock_printers') HAVING COUNT(*) > 0
UNION ALL SELECT 'lf_roll_stock_movements', COUNT(*) FROM lf_roll_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025220000_unified_stock_materials') HAVING COUNT(*) > 0
UNION ALL SELECT 'lf_roll_stock_receipts', COUNT(*) FROM lf_roll_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025220000_unified_stock_materials') HAVING COUNT(*) > 0
UNION ALL SELECT 'sheet_paper_stock_movements', COUNT(*) FROM sheet_paper_stock_movements
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025220000_unified_stock_materials') HAVING COUNT(*) > 0
UNION ALL SELECT 'sheet_paper_stock_receipts', COUNT(*) FROM sheet_paper_stock_receipts
  WHERE created_at > (SELECT at FROM m WHERE migration_name = '20261025220000_unified_stock_materials') HAVING COUNT(*) > 0;

\echo '07 одежда DTF в старых таблицах (в проде таблицы пустые; любая строка — разобраться)'
SELECT 'garment_products' AS tbl, COUNT(*) FROM garment_products HAVING COUNT(*) > 0
UNION ALL SELECT 'garment_variants', COUNT(*) FROM garment_variants HAVING COUNT(*) > 0
UNION ALL SELECT 'garment_stock_receipts', COUNT(*) FROM garment_stock_receipts HAVING COUNT(*) > 0
UNION ALL SELECT 'garment_stock_movements', COUNT(*) FROM garment_stock_movements HAVING COUNT(*) > 0;

\echo '08 старые приходы, привязанные к строке e-Factura, у которой нет прихода в едином складе'
SELECT src, purchase_invoice_line_id FROM (
  SELECT 'mug' AS src, purchase_invoice_line_id FROM mug_stock_receipts
  UNION ALL SELECT 'notebook', purchase_invoice_line_id FROM notebook_stock_receipts
  UNION ALL SELECT 'pen', purchase_invoice_line_id FROM pen_stock_receipts
  UNION ALL SELECT 'lf_roll', purchase_invoice_line_id FROM lf_roll_stock_receipts
  UNION ALL SELECT 'sheet_paper', purchase_invoice_line_id FROM sheet_paper_stock_receipts
  UNION ALL SELECT 'ink', purchase_invoice_line_id FROM ink_stock_receipts
  UNION ALL SELECT 'garment', purchase_invoice_line_id FROM garment_stock_receipts
  UNION ALL SELECT 'dtf_consumable', purchase_invoice_line_id FROM dtf_consumable_receipts
) r
WHERE r.purchase_invoice_line_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stock_receipts s WHERE s.purchase_invoice_line_id = r.purchase_invoice_line_id);

\echo '09 строки фактур / правила сопоставления на выведенных видах без пересчёта в вариант'
-- ink / garment / dtf_film / dtf_powder больше не проводятся (код отказывает); mug / pen / notebook /
-- lf_material / sheet_paper переводятся в вариант через StockItem.legacyId и не мешают.
SELECT 'purchase_invoice_lines' AS tbl, id, posted_kind AS kind, posted_target_id AS target
FROM purchase_invoice_lines WHERE posted_kind IN ('ink', 'garment', 'dtf_film', 'dtf_powder')
UNION ALL
SELECT 'supplier_item_mappings', id, target_kind, target_id
FROM supplier_item_mappings WHERE target_kind IN ('ink', 'garment', 'dtf_film', 'dtf_powder');

\echo '10 остаток варианта не равен сумме движений (расхождение единого склада)'
SELECT v.id, v.sku, v.stock_quantity, COALESCE(m.total, 0) AS movements_total
FROM stock_variants v
LEFT JOIN (SELECT variant_id, SUM(delta) AS total FROM stock_movements GROUP BY variant_id) m
  ON m.variant_id = v.id
WHERE ABS(v.stock_quantity - COALESCE(m.total, 0)) > 0.000001;
