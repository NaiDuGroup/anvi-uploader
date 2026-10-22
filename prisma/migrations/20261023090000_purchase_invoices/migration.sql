-- AlterTable
ALTER TABLE "notebook_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "pen_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "mug_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "lf_roll_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "sheet_paper_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "ink_stock_receipts" ADD COLUMN     "amounts_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_invoice_line_id" TEXT;

-- AlterTable
ALTER TABLE "accounting_settings" ADD COLUMN     "purchase_costs_include_vat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vat_cutover_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "seria" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "efactura_status" INTEGER NOT NULL,
    "supplier_idno" TEXT,
    "supplier_name" TEXT,
    "issue_date" TIMESTAMP(3),
    "delivery_date" TIMESTAMP(3),
    "total_ex_vat" DECIMAL(14,2),
    "vat_amount" DECIMAL(14,2),
    "total_amount" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'new',
    "raw_xml" TEXT,
    "details_fetched_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price_ex_vat" DECIMAL(14,4),
    "total_ex_vat" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2),
    "vat_amount" DECIMAL(14,2),
    "total" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "mapping_id" TEXT,
    "posted_kind" TEXT,
    "posted_target_id" TEXT,
    "posted_quantity" DECIMAL(14,3),
    "posted_cost_mdl" DECIMAL(14,2),
    "posted_at" TIMESTAMP(3),
    "posted_auto" BOOLEAN NOT NULL DEFAULT false,
    "posted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_item_mappings" (
    "id" TEXT NOT NULL,
    "supplier_idno" TEXT NOT NULL,
    "supplier_name" TEXT,
    "normalized_name" TEXT NOT NULL,
    "sample_name" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_id" TEXT,
    "units_per_invoice_unit" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "confirmed_count" INTEGER NOT NULL DEFAULT 0,
    "last_unit_price_ex_vat" DECIMAL(14,4),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_invoices_status_idx" ON "purchase_invoices"("status");

-- CreateIndex
CREATE INDEX "purchase_invoices_supplier_idno_idx" ON "purchase_invoices"("supplier_idno");

-- CreateIndex
CREATE INDEX "purchase_invoices_issue_date_idx" ON "purchase_invoices"("issue_date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_seria_number_key" ON "purchase_invoices"("seria", "number");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_status_idx" ON "purchase_invoice_lines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_lines_invoice_id_position_key" ON "purchase_invoice_lines"("invoice_id", "position");

-- CreateIndex
CREATE INDEX "supplier_item_mappings_target_kind_target_id_idx" ON "supplier_item_mappings"("target_kind", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_item_mappings_supplier_idno_normalized_name_key" ON "supplier_item_mappings"("supplier_idno", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_stock_receipts_purchase_invoice_line_id_key" ON "notebook_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "pen_stock_receipts_purchase_invoice_line_id_key" ON "pen_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "mug_stock_receipts_purchase_invoice_line_id_key" ON "mug_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "lf_roll_stock_receipts_purchase_invoice_line_id_key" ON "lf_roll_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_paper_stock_receipts_purchase_invoice_line_id_key" ON "sheet_paper_stock_receipts"("purchase_invoice_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "ink_stock_receipts_purchase_invoice_line_id_key" ON "ink_stock_receipts"("purchase_invoice_line_id");

-- AddForeignKey
ALTER TABLE "notebook_stock_receipts" ADD CONSTRAINT "notebook_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pen_stock_receipts" ADD CONSTRAINT "pen_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mug_stock_receipts" ADD CONSTRAINT "mug_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lf_roll_stock_receipts" ADD CONSTRAINT "lf_roll_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_paper_stock_receipts" ADD CONSTRAINT "sheet_paper_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ink_stock_receipts" ADD CONSTRAINT "ink_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES "supplier_item_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

