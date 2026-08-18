-- Timestamp of when an order was marked paid. Null for orders paid before
-- this column existed (no backfill: the exact payment date is unknown).
ALTER TABLE "orders" ADD COLUMN "paid_at" TIMESTAMP(3);
