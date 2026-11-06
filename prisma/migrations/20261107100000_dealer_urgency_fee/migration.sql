-- Dealer «Срочно» surcharge: global setting, per-dealer override, per-order fee (additive only).
ALTER TABLE "company_profiles" ADD COLUMN "dealer_urgency_fee_mdl" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "clients" ADD COLUMN "urgency_fee_mdl" DECIMAL(12,2);
ALTER TABLE "clients" ADD COLUMN "urgency_disabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders" ADD COLUMN "urgency_fee" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "urgency_by_dealer_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "urgency_set_by_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "urgency_fee_waived_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "urgency_fee_waived_by_id" TEXT;
