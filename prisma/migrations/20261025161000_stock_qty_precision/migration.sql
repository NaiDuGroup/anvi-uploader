-- Stock quantities to 6 decimals: toner is counted in cartridges and one printed
-- sheet uses ~1/33 000 of a cartridge.
ALTER TABLE "stock_variants" ALTER COLUMN "stock_quantity" SET DATA TYPE DECIMAL(16,6);
ALTER TABLE "stock_receipts" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(16,6);
ALTER TABLE "stock_movements" ALTER COLUMN "delta" SET DATA TYPE DECIMAL(16,6);
