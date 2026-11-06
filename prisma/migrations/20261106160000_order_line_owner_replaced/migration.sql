-- Per-line production status, step 4: the cabinet owner replaced the file of a WAITING line
-- (additive, nullable). See src/lib/ownerLineFileReplace.ts.
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "owner_replaced_at" TIMESTAMP(3);
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "owner_replaced_by_id" TEXT;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "owner_replaced_role" TEXT;
