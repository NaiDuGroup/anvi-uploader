-- Per-line production status, step 3: «Нужен макет» on an order line (additive, nullable).
-- See src/lib/layoutIssue.ts.
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_issue_reason" TEXT;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_issue_note" TEXT;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_issue_at" TIMESTAMP(3);
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_issue_by_id" TEXT;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_fixed_at" TIMESTAMP(3);
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "layout_fixed_by_id" TEXT;

