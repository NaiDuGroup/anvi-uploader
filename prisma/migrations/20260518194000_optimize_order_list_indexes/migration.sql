-- Speed up admin orders list filters/sorting paths used by fetchOrdersData.
CREATE INDEX IF NOT EXISTS "orders_deleted_at_is_workshop_created_at_idx"
ON "orders"("deleted_at", "is_workshop", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "orders_deleted_at_status_created_at_idx"
ON "orders"("deleted_at", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "orders_deleted_at_created_by_created_at_idx"
ON "orders"("deleted_at", "created_by", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "orders_deleted_at_needs_procurement_created_at_idx"
ON "orders"("deleted_at", "needs_procurement", "created_at" DESC);

-- Used by comment list/read-count queries in the admin list and sidebars.
CREATE INDEX IF NOT EXISTS "comments_order_id_created_at_idx"
ON "comments"("order_id", "created_at" DESC);
