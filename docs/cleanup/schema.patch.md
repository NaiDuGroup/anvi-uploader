# Правка `prisma/schema.prisma` для удаления старого склада

Готовый патч: [`schema.prisma.diff`](schema.prisma.diff) (только удаления + 4 обновлённых комментария).
Применять из корня репозитория:

```bash
patch --dry-run -p1 < docs/cleanup/schema.prisma.diff   # сначала проверить, что ложится
patch -p1 < docs/cleanup/schema.prisma.diff
npx prisma validate
```

Если `schema.prisma` к тому времени поменяется и патч не ляжет — сделать те же правки руками по списку ниже.

## Модели целиком (23)

| Модель | Таблица |
|---|---|
| `MugProduct`, `MugStockReceipt`, `MugStockMovement` | `mug_products`, `mug_stock_receipts`, `mug_stock_movements` |
| `NotebookProduct`, `NotebookStockReceipt`, `NotebookStockMovement` | `notebook_products`, `notebook_stock_receipts`, `notebook_stock_movements` |
| `PenProduct`, `PenStockReceipt`, `PenStockMovement` | `pen_products`, `pen_stock_receipts`, `pen_stock_movements` |
| `GarmentProduct`, `GarmentVariant`, `GarmentStockReceipt`, `GarmentStockMovement` | `garment_products`, `garment_variants`, `garment_stock_receipts`, `garment_stock_movements` |
| `DtfConsumableStock`, `DtfConsumableReceipt`, `DtfConsumableMovement` | `dtf_consumable_stock`, `dtf_consumable_receipts`, `dtf_consumable_movements` |
| `InkInventory`, `InkStockReceipt`, `InkStockMovement` | `ink_inventory`, `ink_stock_receipts`, `ink_stock_movements` |
| `LfRollStockReceipt`, `LfRollStockMovement` | `lf_roll_stock_receipts`, `lf_roll_stock_movements` |
| `SheetPaperStockReceipt`, `SheetPaperStockMovement` | `sheet_paper_stock_receipts`, `sheet_paper_stock_movements` |

Вместе с моделями — их `///` / `//` комментарии над ними.

## Поля в оставшихся моделях

- **`Order`**: `mugProductId`, `notebookProductId`, `penProductId`; связи `mugProduct`, `notebookProduct`, `penProduct`; обратные списки `mugStockMovements`, `notebookStockMovements`, `penStockMovements`, `inkStockMovements`, `lfRollStockMovements`, `sheetPaperStockMovements`, `garmentStockMovements`, `dtfConsumableMovements`; индексы `@@index([mugProductId])`, `@@index([notebookProductId])`, `@@index([penProductId])`.
- **`OrderLine`**: `mugProductId`, `notebookProductId`, `penProductId`; связи `mugProduct`, `notebookProduct`, `penProduct`; обратные списки `inkStockMovements`, `lfRollStockMovements`, `sheetPaperStockMovements`, `garmentStockMovements`, `dtfConsumableMovements`; те же три `@@index`.
- **`Design`**: `mugProductId`, `notebookProductId`; связи `mugProduct`, `notebookProduct`.
- **`LargeFormatMaterial`**: `stockLinearMeters`, `avgPurchaseCostPerLinearMeter`, `costPerLinearMeter` (с их `///`); обратные списки `rollReceipts`, `stockMovements`.
- **`SheetPaper`**: `stockSheets`, `avgPurchaseCostPerSheet`, `costPerSheet` (с их `///`); обратные списки `receipts`, `stockMovements`.
- **`PurchaseInvoiceLine`**: обратные связи `mugReceipt`, `notebookReceipt`, `penReceipt`, `lfRollReceipt`, `sheetPaperReceipt`, `inkReceipt`, `garmentReceipt`, `dtfConsumableReceipt` (остаётся `stockReceipt`).
- **`User`**: обратные списки `mugProductsCreated`, `mugStockMovementsCreated`, `notebookProductsCreated`, `notebookStockMovementsCreated`, `penProductsCreated`, `penStockMovementsCreated`, `mugReceiptsCreated`, `notebookReceiptsCreated`, `penReceiptsCreated`, `lfRollReceiptsCreated`, `inkReceiptsCreated`, `inkStockMovementsCreated`, `lfRollStockMovementsCreated`, `sheetPaperReceiptsCreated`, `sheetPaperStockMovementsCreated`, `garmentReceiptsCreated`, `garmentStockMovementsCreated`, `dtfConsumableReceiptsCreated`, `dtfConsumableMovementsCreated`.

`stockVariantId` у `LargeFormatMaterial` / `SheetPaper` / `OrderLine` / `Design` остаются как есть (nullable).

## Код, который меняется вместе со схемой

[`code.patch`](code.patch) (`git apply docs/cleanup/code.patch`) убирает единственное, что код ещё пишет в старые колонки, — заглушку `0` в NOT NULL колонки `cost_per_lm` / `cost_per_sheet`:

- `src/lib/stock/unified/materials.ts` — константа `LEGACY_COST_COLUMN_PLACEHOLDER`;
- `src/app/api/admin/large-format-materials/route.ts` — `costPerLinearMeter` при создании рулона;
- `src/app/api/admin/sheet-papers/route.ts` — `costPerSheet` при создании бумаги;
- `prisma/seed-large-format-materials.ts`, `tests/integration/lfMaterialSeed.ts` — то же в сидах.

Без этого патча `tsc` после правки схемы упадёт ровно на этих строках.

После правки схемы — увеличить `PRISMA_CLIENT_EPOCH` в `src/lib/prisma.ts` (модели удалены).

## Проверено (25.10.2026, на копии локальной базы)

Копия схемы с этим патчем + `code.patch`: `prisma validate` — ок; весь проект (`src`, `tests`, `prisma/*.ts`) проходит `tsc` против клиента, сгенерированного из пропатченной схемы; `prisma migrate diff` между базой после `drop_legacy_stock.sql` и пропатченной схемой — пусто, кроме известных ручных индексов (`comment_reads_user_id_order_id_idx`, `files_order_id_idx`, `orders_phone_trgm_idx`; `ink_stock_receipts_ink_inventory_id_idx` уходит вместе с таблицей).
