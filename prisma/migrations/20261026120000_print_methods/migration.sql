-- Print methods with their own price list and norms (docs/PRINT-METHODS-PLAN.md, stage B).
-- DTF presets and settings are copied with the SAME ids, so saved DTF order lines keep matching.
-- Legacy dtf_print_presets / accounting_settings.dtf_settings stay until cleanup.

-- CreateTable
CREATE TABLE "print_methods" (
    "code" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "printer_code" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_methods_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "print_price_presets" (
    "id" TEXT NOT NULL,
    "method_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width_cm" DECIMAL(6,2) NOT NULL,
    "height_cm" DECIMAL(6,2) NOT NULL,
    "retail_price" DECIMAL(12,2) NOT NULL,
    "dealer_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_price_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_price_presets_method_code_is_active_sort_order_idx" ON "print_price_presets"("method_code", "is_active", "sort_order");

-- AddForeignKey
ALTER TABLE "print_price_presets" ADD CONSTRAINT "print_price_presets_method_code_fkey" FOREIGN KEY ("method_code") REFERENCES "print_methods"("code") ON DELETE RESTRICT ON UPDATE CASCADE;



INSERT INTO "print_methods" ("code", "name_ro", "name_ru", "name_en", "printer_code", "settings", "sort_order", "updated_at")
VALUES
  ('dtf', 'Imprimare DTF', 'DTF-печать', 'DTF print', 'dtf',
   COALESCE((SELECT "dtf_settings" FROM "accounting_settings" LIMIT 1), '{}'::jsonb), 10, CURRENT_TIMESTAMP),
  ('uv',  'Imprimare UV',  'UV-печать',  'UV print',  'uv', '{}'::jsonb, 20, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "print_price_presets" ("id", "method_code", "label", "width_cm", "height_cm", "retail_price", "dealer_price",
                                   "is_active", "sort_order", "created_at", "updated_at")
SELECT p."id", 'dtf', p."label", p."width_cm", p."height_cm", p."retail_price", p."dealer_price",
       p."is_active", p."sort_order", p."created_at", p."updated_at"
FROM "dtf_print_presets" p
ON CONFLICT ("id") DO NOTHING;
