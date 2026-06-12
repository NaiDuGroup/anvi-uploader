CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "orders_phone_trgm_idx" ON "orders" USING gin ("phone" gin_trgm_ops);
