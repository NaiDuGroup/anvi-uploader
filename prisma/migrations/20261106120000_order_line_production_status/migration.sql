-- Per-line production status, step 1 (additive, no behaviour change).
-- Each line mirrors its order's status; see src/lib/orderLineProductionStatus.ts
-- (lineStatusForOrderStatus) — keep the CASE below identical to it.
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "production_status" TEXT NOT NULL DEFAULT 'WAITING';
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "production_status_at" TIMESTAMP(3);

-- Backfill from the parent order (soft-deleted orders included). Unknown → WAITING.
UPDATE "order_lines" AS l
SET "production_status" = CASE o."status"
    WHEN 'WORKSHOP_PRINTING' THEN 'PRINTING'
    WHEN 'WORKSHOP_READY' THEN 'DONE'
    WHEN 'READY_IN_STUDIO' THEN 'DONE'
    WHEN 'RETURNED_TO_STUDIO' THEN 'DONE'
    WHEN 'DELIVERED' THEN 'DONE'
    ELSE 'WAITING'
  END
FROM "orders" AS o
WHERE o."id" = l."order_id"
  -- Every other status maps to WAITING, the column default just added.
  AND o."status" IN ('WORKSHOP_PRINTING', 'WORKSHOP_READY', 'READY_IN_STUDIO', 'RETURNED_TO_STUDIO', 'DELIVERED');
