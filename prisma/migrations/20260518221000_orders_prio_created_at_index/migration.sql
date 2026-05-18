-- Improves default admin list sorting path:
-- deleted_at filter + is_prio/status/date ordering.
CREATE INDEX IF NOT EXISTS "orders_deleted_at_is_prio_created_at_idx"
ON "orders"("deleted_at", "is_prio", "created_at" DESC);
