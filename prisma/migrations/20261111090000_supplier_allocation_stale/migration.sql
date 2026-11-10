-- «Взаиморасчёты»: confirmed supplier links that no longer hold (payment re-attributed / invoice not live). Additive only.
ALTER TABLE "supplier_payment_allocations" ADD COLUMN IF NOT EXISTS "stale_reason" TEXT;
