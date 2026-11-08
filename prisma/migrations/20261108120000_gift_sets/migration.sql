-- «Набор» (gift set): lines of one set share a group id; set metadata (template, quantity, price share, box) per line.
ALTER TABLE "order_lines" ADD COLUMN "set_group_id" TEXT;
ALTER TABLE "order_lines" ADD COLUMN "set_data" JSONB;
CREATE INDEX "order_lines_set_group_id_idx" ON "order_lines"("set_group_id");

-- Admin-editable set templates («Шаблоны наборов»); null = the defaults in code (src/lib/giftSet/giftSet.ts).
ALTER TABLE "accounting_settings" ADD COLUMN "gift_set_templates" JSONB;
