# Этап 5 «Уборка»: удаление старого учёта склада

Здесь подготовлено, но **не применено** удаление старых таблиц и колонок склада.
В `prisma/migrations/` этого ещё нет — туда папка попадает только по шагу 4 ниже.

| Файл | Что это |
|---|---|
| `checks.sql` | Проверки перед удалением. Каждый запрос должен вернуть 0 строк. |
| `drop_legacy_stock.sql` | Сама миграция: удаляет старые колонки и 23 таблицы. |
| `schema.prisma.diff` | Правка `prisma/schema.prisma` под базу после удаления. |
| `schema.patch.md` | То же списком: что удаляется и почему. |
| `code.patch` | Код, который меняется вместе со схемой (заглушка `0` для `cost_per_lm` / `cost_per_sheet`). |

## Когда запускать

Только когда выполнено всё:

1. Этапы 1–4 выкачены в прод.
2. Прошло **около месяца** работы на едином складе.
3. За это время **не было расхождений**: остатки на страницах склада сходятся с полкой, прибыль по старым заказам не «поплыла», а проверка 10 в `checks.sql` (остаток = сумма движений) пустая.
4. Шаги ниже выполняются в нерабочее время, никто не оформляет заказы.

Что удаляется:

- таблицы: кружки, блокноты, ручки (`mug_*`, `notebook_*`, `pen_*`), одежда DTF (`garment_*`), плёнка/порошок DTF (`dtf_consumable_*`), баки чернил (`ink_inventory`, `ink_stock_*`), журналы рулонов и бумаги (`lf_roll_stock_*`, `sheet_paper_stock_*`);
- колонки: `orders` / `order_lines`.`mug_product_id`, `notebook_product_id`, `pen_product_id`; `designs`.`mug_product_id`, `notebook_product_id`; `large_format_materials`.`stock_linear_m`, `avg_purchase_cost_per_lm`, `cost_per_lm`; `sheet_papers`.`stock_sheets`, `avg_purchase_cost_per_sheet`, `cost_per_sheet`.

Код эти таблицы и колонки уже не читает (кроме записи заглушки `0`, её убирает `code.patch`).

Ниже `$PROD_DATABASE_URL` — строка подключения к прод-базе (прямой адрес, **не** `-pooler`),
`$STAMP` — метка времени для файлов:

```bash
export STAMP=$(date -u +%Y%m%d-%H%M%S)
mkdir -p db-backups   # каталог не коммитим (как backups/)
```

## Шаг 1. Архивный дамп

**1а. Полный снимок базы** (как перед каждым этапом):

```bash
pg_dump "$PROD_DATABASE_URL" -Fc --no-owner --no-acl \
  -f db-backups/prod-before-stock-cleanup-$STAMP.dump
```

**1б. Архив ровно старых таблиц** (из него восстанавливаемся при откате):

```bash
pg_dump "$PROD_DATABASE_URL" -Fc --no-owner --no-acl \
  -t mug_products -t mug_stock_receipts -t mug_stock_movements \
  -t notebook_products -t notebook_stock_receipts -t notebook_stock_movements \
  -t pen_products -t pen_stock_receipts -t pen_stock_movements \
  -t garment_products -t garment_variants -t garment_stock_receipts -t garment_stock_movements \
  -t dtf_consumable_stock -t dtf_consumable_receipts -t dtf_consumable_movements \
  -t ink_inventory -t ink_stock_receipts -t ink_stock_movements \
  -t lf_roll_stock_receipts -t lf_roll_stock_movements \
  -t sheet_paper_stock_receipts -t sheet_paper_stock_movements \
  -f db-backups/legacy-stock-tables-$STAMP.dump
```

**1в. Удаляемые колонки** (`-t` целиком колонки не умеет — выгружаем их в CSV с id строки):

```bash
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
\copy (SELECT id, mug_product_id, notebook_product_id, pen_product_id FROM order_lines WHERE COALESCE(mug_product_id, notebook_product_id, pen_product_id) IS NOT NULL) TO 'db-backups/legacy-order_lines-$STAMP.csv' CSV HEADER
\copy (SELECT id, mug_product_id, notebook_product_id, pen_product_id FROM orders WHERE COALESCE(mug_product_id, notebook_product_id, pen_product_id) IS NOT NULL) TO 'db-backups/legacy-orders-$STAMP.csv' CSV HEADER
\copy (SELECT id, mug_product_id, notebook_product_id FROM designs WHERE COALESCE(mug_product_id, notebook_product_id) IS NOT NULL) TO 'db-backups/legacy-designs-$STAMP.csv' CSV HEADER
\copy (SELECT id, stock_linear_m, avg_purchase_cost_per_lm, cost_per_lm FROM large_format_materials) TO 'db-backups/legacy-large_format_materials-$STAMP.csv' CSV HEADER
\copy (SELECT id, stock_sheets, avg_purchase_cost_per_sheet, cost_per_sheet FROM sheet_papers) TO 'db-backups/legacy-sheet_papers-$STAMP.csv' CSV HEADER
SQL
```

Проверить, что архив читается: `pg_restore -l db-backups/legacy-stock-tables-$STAMP.dump | grep -c "TABLE DATA"` → `23`.

## Шаг 2. Проверки

**2а. База** — каждый блок должен вывести `(0 rows)`:

```bash
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/cleanup/checks.sql
```

| № | Что проверяем |
|---|---|
| 01 | у каждой старой кружки / блокнота / ручки есть позиция единого склада (`legacy_kind` + `legacy_id`) |
| 02 | у каждого рулона и вида бумаги есть `stock_variant_id` |
| 03 | нет строки заказа со старой ссылкой на товар, но без `stock_variant_id` |
| 04 | нет заказа со старой ссылкой, у которого ни одна строка не держит вариант |
| 05 | нет дизайна со старой ссылкой, но без `stock_variant_id` |
| 06 | в старые журналы ничего не писалось после переноса своего вида |
| 07 | таблицы одежды DTF пустые (в проде их не заполняли) |
| 08 | у каждого старого прихода из e-Factura есть приход в едином складе по той же строке фактуры |
| 09 | нет строк фактур / правил сопоставления на выведенных видах `ink`, `garment`, `dtf_film`, `dtf_powder` |
| 10 | остаток каждого варианта = сумма его движений |

Если что-то не пустое — **стоп**, разобраться (и при необходимости дописать перенос), потом заново с шага 1.

**2б. Код** — в рабочей копии, которую будем выкатывать; каждая команда не должна ничего найти:

```bash
# обращения к старым моделям Prisma
grep -rnE "\.(mugProduct|mugStockReceipt|mugStockMovement|notebookProduct|notebookStockReceipt|notebookStockMovement|penProduct|penStockReceipt|penStockMovement|garmentProduct|garmentVariant|garmentStockReceipt|garmentStockMovement|dtfConsumableStock|dtfConsumableReceipt|dtfConsumableMovement|inkInventory|inkStockReceipt|inkStockMovement|lfRollStockReceipt|lfRollStockMovement|sheetPaperStockReceipt|sheetPaperStockMovement)\b" \
  src scripts tests prisma/*.ts --include=*.ts --include=*.tsx --include=*.mjs \
  | grep -vE "^src/lib/design/(designJson\.ts|designProduct\.test\.ts):"   # mugProduct / notebookProduct дизайна — DTO из варианта, не таблица

# старые таблицы / колонки в сыром SQL (комментарии с именами таблиц не в счёт)
grep -rnE "(FROM|JOIN|INTO|UPDATE)\s+\"?(mug_products|mug_stock_|notebook_products|notebook_stock_|pen_products|pen_stock_|garment_|dtf_consumable_|ink_inventory|ink_stock_|lf_roll_stock_|sheet_paper_stock_)" \
  src scripts tests prisma/*.ts --include=*.ts --include=*.tsx --include=*.mjs
grep -rnE "stock_linear_m|avg_purchase_cost_per_(lm|sheet)|cost_per_lm|cost_per_sheet|stock_sheets|(mug|notebook|pen)_product_id" \
  src scripts tests prisma/*.ts --include=*.ts --include=*.tsx --include=*.mjs | grep -v "^\S*:\s*\(\*\|//\)"
```

Самая надёжная проверка — шаг 3: после правки схемы `npx tsc --noEmit -p .` должен пройти (Prisma-клиент без старых моделей не даст скомпилировать ни одно обращение к ним).

## Шаг 3. Правка схемы и кода (в ветке, до выкладки)

```bash
patch -p1 < docs/cleanup/schema.prisma.diff     # см. schema.patch.md, если не ляжет
git apply docs/cleanup/code.patch
# src/lib/prisma.ts: PRISMA_CLIENT_EPOCH += 1
npx prisma validate && npx prisma generate
npx tsc --noEmit -p . && npm run test
```

## Шаг 4. Миграция и выкладка

Подготовленная миграция становится папкой в `prisma/migrations/` (имя — текущее время UTC, позже всех существующих):

```bash
MIG=prisma/migrations/$(date -u +%Y%m%d%H%M%S)_drop_legacy_stock
mkdir "$MIG" && cp docs/cleanup/drop_legacy_stock.sql "$MIG/migration.sql"
```

Проверить на свежей копии прода локально (как при переносе): база из дампа шага 1а → `npx prisma migrate deploy` → `npx prisma migrate diff --from-url <локальная копия> --to-schema-datamodel prisma/schema.prisma --script` должен показать только известные ручные индексы (`comment_reads_user_id_order_id_idx`, `files_order_id_idx`, `orders_phone_trgm_idx`) → открыть склад, заказ, прибыль.

Потом закоммитить схему, код и папку миграции и выкатить: прод-сборка (`npm run build`) сама выполнит `prisma migrate deploy`. Либо вручную:

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate status
```

Миграция без `CASCADE`: если на старые таблицы неожиданно что-то ссылается, она упадёт, ничего не удалив.

## Откат

Удаление необратимо без архива, поэтому откат = восстановление из шага 1.

1. Вернуть код на предыдущий релиз (со старыми моделями в схеме) и выкатить.
2. Таблицы — из архива 1б:

   ```bash
   pg_restore -d "$PROD_DATABASE_URL" --no-owner --no-acl db-backups/legacy-stock-tables-$STAMP.dump
   ```

3. Колонки — вернуть пустыми и залить из CSV 1в, например для строк заказов:

   ```sql
   ALTER TABLE order_lines
     ADD COLUMN mug_product_id text REFERENCES mug_products(id) ON UPDATE CASCADE ON DELETE SET NULL,
     ADD COLUMN notebook_product_id text REFERENCES notebook_products(id) ON UPDATE CASCADE ON DELETE SET NULL,
     ADD COLUMN pen_product_id text REFERENCES pen_products(id) ON UPDATE CASCADE ON DELETE SET NULL;
   CREATE TEMP TABLE r (id text, mug_product_id text, notebook_product_id text, pen_product_id text);
   \copy r FROM 'db-backups/legacy-order_lines-<STAMP>.csv' CSV HEADER
   UPDATE order_lines l SET mug_product_id = r.mug_product_id, notebook_product_id = r.notebook_product_id,
     pen_product_id = r.pen_product_id FROM r WHERE r.id = l.id;
   ```

   Так же для `orders`, `designs`; у `large_format_materials` / `sheet_papers` колонки `cost_per_lm` / `cost_per_sheet` — `integer NOT NULL DEFAULT 0` (после заливки `DEFAULT` можно снять), остальные — `numeric(14,3|4)` / `numeric(14,2|4)` как в старой схеме. Индексы — как в старой миграции (`git show <старый коммит>:prisma/schema.prisma`).
4. Убрать запись миграции: `DELETE FROM _prisma_migrations WHERE migration_name LIKE '%_drop_legacy_stock';`
5. Если что-то пошло совсем не так — полный снимок 1а (`pg_restore --clean --if-exists`), понимая, что пропадут все изменения после него.

## Как это проверено (25.10.2026)

На временной копии локальной базы (`printupload_cleanup_test`, копия прод-данных; удалена после проверки):
`checks.sql` — все 10 блоков пустые (а подложенные нарушения ловит: строка заказа без варианта → 03, запись в старый журнал после переноса → 06);
`drop_legacy_stock.sql` выполнился в одной транзакции и повторно (идемпотентен, `IF EXISTS`);
`prisma migrate diff` между базой после удаления и пропатченной схемой — только три известных ручных индекса;
весь проект проходит `tsc` против Prisma-клиента из пропатченной схемы с применённым `code.patch`.
