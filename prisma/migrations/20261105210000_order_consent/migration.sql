-- Guest upload form consent proof (timestamp + text version). Additive, nullable.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "consent_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "consent_version" TEXT;
