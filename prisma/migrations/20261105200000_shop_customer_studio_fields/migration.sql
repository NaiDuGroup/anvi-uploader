-- ANVI Studio «Datele mele» (additive, nullable).
ALTER TABLE "shop_customers" ADD COLUMN IF NOT EXISTS "studio_fields" JSONB;
