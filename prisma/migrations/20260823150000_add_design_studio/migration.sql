-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "design_id" TEXT;

-- CreateTable
CREATE TABLE "designs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "target_type" TEXT NOT NULL,
    "mug_product_id" TEXT,
    "notebook_product_id" TEXT,
    "width_cm" DECIMAL(6,2) NOT NULL,
    "height_cm" DECIMAL(6,2) NOT NULL,
    "dpi" INTEGER NOT NULL DEFAULT 300,
    "canvas_width_px" INTEGER NOT NULL,
    "canvas_height_px" INTEGER NOT NULL,
    "doc" JSONB NOT NULL,
    "doc_version" INTEGER NOT NULL DEFAULT 1,
    "render_key" TEXT,
    "thumb_key" TEXT,
    "rendered_at" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "file_key" TEXT NOT NULL,
    "thumb_key" TEXT,
    "width_px" INTEGER NOT NULL,
    "height_px" INTEGER NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "designs_status_updated_at_idx" ON "designs"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "designs_is_template_idx" ON "designs"("is_template");

-- CreateIndex
CREATE INDEX "design_assets_category_idx" ON "design_assets"("category");

-- CreateIndex
CREATE INDEX "order_lines_design_id_idx" ON "order_lines"("design_id");

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_mug_product_id_fkey" FOREIGN KEY ("mug_product_id") REFERENCES "mug_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designs" ADD CONSTRAINT "designs_notebook_product_id_fkey" FOREIGN KEY ("notebook_product_id") REFERENCES "notebook_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

