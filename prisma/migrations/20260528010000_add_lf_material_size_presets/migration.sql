-- CreateTable: per-material size preset (price list) for large-format materials.
CREATE TABLE "lf_material_size_presets" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "width_cm" INTEGER NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "retail_price_mdl" INTEGER NOT NULL,
    "dealer_price_mdl" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lf_material_size_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lf_material_size_presets_material_id_width_cm_height_cm_key" ON "lf_material_size_presets"("material_id", "width_cm", "height_cm");

-- CreateIndex
CREATE INDEX "lf_material_size_presets_material_id_sort_order_idx" ON "lf_material_size_presets"("material_id", "sort_order");

-- AddForeignKey
ALTER TABLE "lf_material_size_presets" ADD CONSTRAINT "lf_material_size_presets_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "large_format_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
