-- Per-product print area (cm at `printDpi`) and 3D-preview opt-out for catalog products.
-- Defaults match the legacy hardcoded canvas dimensions, so existing rows keep current
-- behaviour without an explicit UPDATE step.

-- AlterTable: mug_products
ALTER TABLE "mug_products"
ADD COLUMN "print_width_cm"  DECIMAL(5, 2) NOT NULL DEFAULT 21.0,
ADD COLUMN "print_height_cm" DECIMAL(5, 2) NOT NULL DEFAULT 9.6,
ADD COLUMN "print_dpi"       INTEGER       NOT NULL DEFAULT 300,
ADD COLUMN "has_3d_preview"  BOOLEAN       NOT NULL DEFAULT true;

-- AlterTable: notebook_products
ALTER TABLE "notebook_products"
ADD COLUMN "print_width_cm"  DECIMAL(5, 2) NOT NULL DEFAULT 14.0,
ADD COLUMN "print_height_cm" DECIMAL(5, 2) NOT NULL DEFAULT 21.4,
ADD COLUMN "print_dpi"       INTEGER       NOT NULL DEFAULT 300,
ADD COLUMN "has_3d_preview"  BOOLEAN       NOT NULL DEFAULT true;
