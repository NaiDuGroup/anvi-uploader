-- Client t-shirt designer: editable design (layers per side) and mockup keys per order line.
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "designer_data" JSONB;
