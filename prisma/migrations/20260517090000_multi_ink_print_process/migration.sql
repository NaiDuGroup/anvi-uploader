-- Multiple ink tanks keyed by print process (was singleton id = 'default').
-- Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ink_stock_receipts'
      AND column_name = 'ink_inventory_id'
  ) THEN
    ALTER TABLE "ink_stock_receipts" ADD COLUMN "ink_inventory_id" TEXT;
  END IF;
END $$;

-- Single `default` row and no `large_format_roll`: rename in place.
UPDATE "ink_inventory" SET "id" = 'large_format_roll'
WHERE "id" = 'default'
  AND NOT EXISTS (SELECT 1 FROM "ink_inventory" AS i2 WHERE i2."id" = 'large_format_roll');

-- Both `default` and `large_format_roll`: merge stock + weighted avg, then drop `default`.
UPDATE "ink_inventory" AS target
SET
  "stock_ml" = target."stock_ml" + src."stock_ml",
  "avg_cost_per_ml_mdl" = CASE
    WHEN (target."stock_ml" + src."stock_ml") > 0 THEN
      (target."avg_cost_per_ml_mdl" * target."stock_ml" + src."avg_cost_per_ml_mdl" * src."stock_ml")
      / (target."stock_ml" + src."stock_ml")
    ELSE target."avg_cost_per_ml_mdl"
  END
FROM "ink_inventory" AS src
WHERE target."id" = 'large_format_roll'
  AND src."id" = 'default';

DELETE FROM "ink_inventory" WHERE "id" = 'default';

INSERT INTO "ink_inventory" ("id", "stock_ml", "avg_cost_per_ml_mdl", "created_at", "updated_at")
VALUES
  ('large_format_roll', 0, 0, NOW(), NOW()),
  ('uv_rigid', 0, 0, NOW(), NOW()),
  ('dtf_textile', 0, 0, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

UPDATE "ink_stock_receipts" SET "ink_inventory_id" = 'large_format_roll' WHERE "ink_inventory_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ink_stock_receipts'
      AND column_name = 'ink_inventory_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "ink_stock_receipts" ALTER COLUMN "ink_inventory_id" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ink_stock_receipts_ink_inventory_id_fkey'
  ) THEN
    ALTER TABLE "ink_stock_receipts"
      ADD CONSTRAINT "ink_stock_receipts_ink_inventory_id_fkey"
      FOREIGN KEY ("ink_inventory_id") REFERENCES "ink_inventory" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ink_stock_receipts_ink_inventory_id_idx"
  ON "ink_stock_receipts" ("ink_inventory_id");

DROP INDEX IF EXISTS "ink_stock_receipts_purchased_at_idx";

CREATE INDEX IF NOT EXISTS "ink_stock_receipts_ink_inventory_id_purchased_at_idx"
  ON "ink_stock_receipts" ("ink_inventory_id", "purchased_at" DESC);
