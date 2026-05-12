-- Replace retired order statuses with studio in-progress workflow.
UPDATE "orders"
SET "status" = 'IN_PROGRESS'
WHERE "status" IN ('PENDING_APPROVAL', 'CHANGES_REQUESTED');
