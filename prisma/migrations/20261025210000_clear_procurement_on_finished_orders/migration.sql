-- Orders already back in the studio or handed to the client keep an old «докупить»
-- flag from the legacy stock (mugs, paper). The goods were found long ago; a new
-- receipt must not write stock off for them. Clear the flag WITHOUT any stock movement.
-- From now on, receipts skip these statuses (FINISHED_ORDER_STATUSES in code).
UPDATE "orders"
SET "needs_procurement" = false,
    "procurement_meta" = NULL
WHERE "needs_procurement" = true
  AND "status" IN ('DELIVERED', 'RETURNED_TO_STUDIO');
