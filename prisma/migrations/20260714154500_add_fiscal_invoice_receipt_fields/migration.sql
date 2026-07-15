-- AlterTable: fiscal receipt (Bon Fiscal / B/f) settlement + XML enrichment marker
ALTER TABLE "fiscal_invoices" ADD COLUMN "receipt_ref" TEXT;
ALTER TABLE "fiscal_invoices" ADD COLUMN "receipt_method" TEXT;
ALTER TABLE "fiscal_invoices" ADD COLUMN "receipt_settled_at" TIMESTAMP(3);
ALTER TABLE "fiscal_invoices" ADD COLUMN "details_fetched_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "fiscal_invoices_details_fetched_at_idx" ON "fiscal_invoices"("details_fetched_at");
CREATE INDEX "fiscal_invoices_receipt_settled_at_idx" ON "fiscal_invoices"("receipt_settled_at");
