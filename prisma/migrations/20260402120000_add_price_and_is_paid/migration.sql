-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "price" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_paid" BOOLEAN NOT NULL DEFAULT false;

-- Clean up columns from earlier attempts (safe to re-run)
ALTER TABLE "orders" DROP COLUMN IF EXISTS "amount_mdl";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "total_price";
