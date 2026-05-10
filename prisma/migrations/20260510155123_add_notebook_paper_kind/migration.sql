-- Notebook type: ruled (linii) / squared (clete) / dated (datat).
-- Existing rows backfill to 'ruled' via the column default — no UPDATE step needed.

-- AlterTable: notebook_products
ALTER TABLE "notebook_products"
ADD COLUMN "paper_kind" TEXT NOT NULL DEFAULT 'ruled';
