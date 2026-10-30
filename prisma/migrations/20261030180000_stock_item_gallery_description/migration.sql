-- Extra photos and a client-facing description per stock item; supplier sync time.
ALTER TABLE "stock_items" ADD COLUMN "gallery_images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "stock_items" ADD COLUMN "description" JSONB;
ALTER TABLE "stock_items" ADD COLUMN "supplier_media_at" TIMESTAMP(3);
