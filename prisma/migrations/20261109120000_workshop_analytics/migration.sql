-- «Аналитика цеха»: silent ISSUE reason key next to the localized text, and an
-- index for period scans of the order log by action. Additive only.
ALTER TABLE "orders" ADD COLUMN "issue_reason_code" TEXT;

CREATE INDEX "order_logs_action_created_at_idx" ON "order_logs"("action", "created_at");
