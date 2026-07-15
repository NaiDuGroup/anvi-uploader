-- AlterTable
ALTER TABLE "fiscal_invoices" ADD COLUMN     "paid_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payment_allocations" ADD COLUMN     "fiscal_invoice_id" TEXT,
ALTER COLUMN "invoice_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "fiscal_invoices_client_id_idx" ON "fiscal_invoices"("client_id");

-- CreateIndex
CREATE INDEX "fiscal_invoices_paid_at_idx" ON "fiscal_invoices"("paid_at");

-- CreateIndex
CREATE INDEX "payment_allocations_fiscal_invoice_id_idx" ON "payment_allocations"("fiscal_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_bank_transaction_id_fiscal_invoice_id_key" ON "payment_allocations"("bank_transaction_id", "fiscal_invoice_id");

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_fiscal_invoice_id_fkey" FOREIGN KEY ("fiscal_invoice_id") REFERENCES "fiscal_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
