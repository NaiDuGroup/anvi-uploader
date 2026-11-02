-- File facts shown to staff: weight, pixels, dpi, physical size.
ALTER TABLE "files"
  ADD COLUMN "size_bytes" DOUBLE PRECISION,
  ADD COLUMN "pixel_width" INTEGER,
  ADD COLUMN "pixel_height" INTEGER,
  ADD COLUMN "dpi" DOUBLE PRECISION,
  ADD COLUMN "width_mm" DOUBLE PRECISION,
  ADD COLUMN "height_mm" DOUBLE PRECISION,
  ADD COLUMN "meta_status" TEXT,
  ADD COLUMN "meta_read_at" TIMESTAMP(3);
