-- «Оплата только при получении (временно)»: super-admin switch for the storefront,
-- ON by default (Paynet is not live yet: customers could not pay online).
ALTER TABLE "company_profiles" ADD COLUMN "shop_pay_on_delivery" BOOLEAN NOT NULL DEFAULT true;

-- Storefront orders placed since the public launch (2026-11-07, Chișinău) whose
-- online payment never went through: they become pay-on-delivery orders, so staff
-- work on them like any new order and the customer is not asked to pay online.
-- Test-payment orders and trashed orders are left alone.
UPDATE "orders"
SET "payment_provider" = 'on_delivery',
    "payment_status" = 'pending'
WHERE "source" = 'shop'
  AND "payment_provider" = 'paynet'
  AND "payment_status" IN ('pending', 'unpaid', 'failed')
  AND "is_paid" = false
  AND "deleted_at" IS NULL
  AND "created_at" >= TIMESTAMP '2026-11-06 22:00:00';
