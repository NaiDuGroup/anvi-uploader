-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'maib_csv',
    "account_iban" TEXT,
    "opening_balance" DECIMAL(14,2),
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "storage_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PARSED',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "error_report" JSONB,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "booking_date" TIMESTAMP(3) NOT NULL,
    "value_date" TIMESTAMP(3),
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "counterparty_name" TEXT,
    "counterparty_idno" TEXT,
    "counterparty_iban" TEXT,
    "purpose" TEXT,
    "document_number" TEXT,
    "bank_ref" TEXT,
    "tx_type_code" TEXT,
    "match_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "matched_by" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" INTEGER,
    "matched_by_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_invoices" (
    "id" TEXT NOT NULL,
    "seria" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "efactura_status" INTEGER NOT NULL,
    "issue_date" TIMESTAMP(3),
    "total_amount" DECIMAL(14,2),
    "vat_amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'MDL',
    "buyer_name" TEXT,
    "buyer_idno" TEXT,
    "buyer_snapshot" JSONB,
    "raw_payload" JSONB,
    "invoice_id" TEXT,
    "client_id" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statements_created_at_idx" ON "bank_statements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_dedupe_key_key" ON "bank_transactions"("dedupe_key");

-- CreateIndex
CREATE INDEX "bank_transactions_statement_id_idx" ON "bank_transactions"("statement_id");

-- CreateIndex
CREATE INDEX "bank_transactions_match_status_idx" ON "bank_transactions"("match_status");

-- CreateIndex
CREATE INDEX "bank_transactions_booking_date_idx" ON "bank_transactions"("booking_date");

-- CreateIndex
CREATE INDEX "bank_transactions_counterparty_idno_idx" ON "bank_transactions"("counterparty_idno");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_bank_transaction_id_invoice_id_key" ON "payment_allocations"("bank_transaction_id", "invoice_id");

-- CreateIndex
CREATE INDEX "fiscal_invoices_efactura_status_idx" ON "fiscal_invoices"("efactura_status");

-- CreateIndex
CREATE INDEX "fiscal_invoices_buyer_idno_idx" ON "fiscal_invoices"("buyer_idno");

-- CreateIndex
CREATE INDEX "fiscal_invoices_issue_date_idx" ON "fiscal_invoices"("issue_date");

-- CreateIndex
CREATE INDEX "fiscal_invoices_invoice_id_idx" ON "fiscal_invoices"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_invoices_seria_number_key" ON "fiscal_invoices"("seria", "number");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_matched_by_id_fkey" FOREIGN KEY ("matched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_invoices" ADD CONSTRAINT "fiscal_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
