-- AlterTable
ALTER TABLE "fiscal_invoices" ADD COLUMN IF NOT EXISTS "redirections" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "fiscal_invoices_redirections_idx" ON "fiscal_invoices"("redirections");
