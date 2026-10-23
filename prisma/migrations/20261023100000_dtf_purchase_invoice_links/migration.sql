-- Links DTF receipts to purchase invoice lines. Kept out of `dtf_apparel` because
-- `purchase_invoice_lines` is created by a later-dated migration; databases that
-- applied the original `dtf_apparel` already have these constraints.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'garment_stock_receipts_purchase_invoice_line_id_fkey'
  ) THEN
    ALTER TABLE "garment_stock_receipts" ADD CONSTRAINT "garment_stock_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dtf_consumable_receipts_purchase_invoice_line_id_fkey'
  ) THEN
    ALTER TABLE "dtf_consumable_receipts" ADD CONSTRAINT "dtf_consumable_receipts_purchase_invoice_line_id_fkey" FOREIGN KEY ("purchase_invoice_line_id") REFERENCES "purchase_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
