-- AlterTable
ALTER TABLE "orders" ADD COLUMN "needs_procurement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "procurement_meta" JSONB;

-- CreateIndex
CREATE INDEX "orders_needs_procurement_idx" ON "orders"("needs_procurement");
