-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "large_format_line_data" JSONB,
ADD COLUMN     "large_format_material_id" TEXT;

-- CreateTable
CREATE TABLE "large_format_materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roll_width_m" DECIMAL(8,3) NOT NULL,
    "roll_length_m" DECIMAL(8,3) NOT NULL,
    "cost_per_lm" INTEGER NOT NULL,
    "dealer_price_per_lm" INTEGER NOT NULL,
    "retail_price_per_lm" INTEGER NOT NULL,
    "dealer_print_price_per_lm" INTEGER NOT NULL,
    "retail_print_price_per_lm" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "large_format_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "large_format_materials_is_active_idx" ON "large_format_materials"("is_active");

-- CreateIndex
CREATE INDEX "large_format_materials_sort_order_idx" ON "large_format_materials"("sort_order");

-- CreateIndex
CREATE INDEX "order_lines_large_format_material_id_idx" ON "order_lines"("large_format_material_id");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_large_format_material_id_fkey" FOREIGN KEY ("large_format_material_id") REFERENCES "large_format_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
