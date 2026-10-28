-- AlterTable
ALTER TABLE "stock_variants" ADD COLUMN     "supplier_code" TEXT;

-- CreateTable
CREATE TABLE "import_shipments" (
    "id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "supplier_order_no" TEXT,
    "proforma_no" TEXT,
    "broker_name" TEXT,
    "declaration_no" TEXT,
    "tracking_no" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "ordered_at" DATE,
    "arrived_at" DATE,
    "status" TEXT NOT NULL DEFAULT 'ordered',
    "notes" TEXT,
    "related_import_id" TEXT,
    "posted_mode" TEXT,
    "posted_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_documents" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "note" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_costs" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_mdl" DECIMAL(14,2) NOT NULL,
    "is_provisional" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "import_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_lines" (
    "id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(16,6) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "variant_id" TEXT,
    "skip" BOOLEAN NOT NULL DEFAULT false,
    "receipt_id" TEXT,
    "posted_unit_cost_mdl" DECIMAL(14,4),

    CONSTRAINT "import_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_shipments_ordered_at_idx" ON "import_shipments"("ordered_at");

-- CreateIndex
CREATE INDEX "import_documents_import_id_idx" ON "import_documents"("import_id");

-- CreateIndex
CREATE INDEX "import_costs_import_id_idx" ON "import_costs"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_lines_receipt_id_key" ON "import_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "import_lines_import_id_position_idx" ON "import_lines"("import_id", "position");

-- CreateIndex
CREATE INDEX "import_lines_variant_id_idx" ON "import_lines"("variant_id");

-- CreateIndex
CREATE INDEX "stock_variants_supplier_code_idx" ON "stock_variants"("supplier_code");

-- AddForeignKey
ALTER TABLE "import_shipments" ADD CONSTRAINT "import_shipments_related_import_id_fkey" FOREIGN KEY ("related_import_id") REFERENCES "import_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_documents" ADD CONSTRAINT "import_documents_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_costs" ADD CONSTRAINT "import_costs_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_lines" ADD CONSTRAINT "import_lines_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "import_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_lines" ADD CONSTRAINT "import_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "stock_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_lines" ADD CONSTRAINT "import_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

