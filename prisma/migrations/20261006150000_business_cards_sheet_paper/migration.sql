-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "business_card_line_data" JSONB,
ADD COLUMN     "sheet_paper_id" TEXT;

-- CreateTable
CREATE TABLE "sheet_papers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheet_width_cm" DECIMAL(8,2) NOT NULL,
    "sheet_height_cm" DECIMAL(8,2) NOT NULL,
    "stock_sheets" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "avg_purchase_cost_per_sheet" DECIMAL(14,4),
    "cost_per_sheet" INTEGER NOT NULL,
    "retail_price_per_sheet" INTEGER NOT NULL,
    "dealer_price_per_sheet" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_paper_stock_receipts" (
    "id" TEXT NOT NULL,
    "sheet_paper_id" TEXT NOT NULL,
    "quantity_sheets" DECIMAL(14,2) NOT NULL,
    "total_cost_mdl" INTEGER NOT NULL,
    "purchased_at" DATE NOT NULL,
    "supplier" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_paper_stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_paper_stock_movements" (
    "id" TEXT NOT NULL,
    "sheet_paper_id" TEXT NOT NULL,
    "quantity_sheets" DECIMAL(14,2) NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "paper_cost_mdl" INTEGER,
    "paper_sell_price_mdl" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_paper_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_papers_is_active_idx" ON "sheet_papers"("is_active");

-- CreateIndex
CREATE INDEX "sheet_papers_sort_order_idx" ON "sheet_papers"("sort_order");

-- CreateIndex
CREATE INDEX "sheet_paper_stock_receipts_sheet_paper_id_purchased_at_idx" ON "sheet_paper_stock_receipts"("sheet_paper_id", "purchased_at" DESC);

-- CreateIndex
CREATE INDEX "sheet_paper_stock_movements_sheet_paper_id_created_at_idx" ON "sheet_paper_stock_movements"("sheet_paper_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sheet_paper_stock_movements_order_id_idx" ON "sheet_paper_stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_sheet_paper_id_idx" ON "order_lines"("sheet_paper_id");

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_receipts" ADD CONSTRAINT "sheet_paper_stock_receipts_sheet_paper_id_fkey" FOREIGN KEY ("sheet_paper_id") REFERENCES "sheet_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_receipts" ADD CONSTRAINT "sheet_paper_stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_movements" ADD CONSTRAINT "sheet_paper_stock_movements_sheet_paper_id_fkey" FOREIGN KEY ("sheet_paper_id") REFERENCES "sheet_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_movements" ADD CONSTRAINT "sheet_paper_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_movements" ADD CONSTRAINT "sheet_paper_stock_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_movements" ADD CONSTRAINT "sheet_paper_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_sheet_paper_id_fkey" FOREIGN KEY ("sheet_paper_id") REFERENCES "sheet_papers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

