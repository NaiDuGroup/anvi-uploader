-- «Взаиморасчёты» stage 3: supplier payment ↔ invoice links, check dismissals, audit log. Additive only.
-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "purchase_invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "created_by_id" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_check_dismissals" (
    "id" TEXT NOT NULL,
    "signal_key" TEXT NOT NULL,
    "note" TEXT,
    "dismissed_by_id" TEXT,
    "dismissed_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_check_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_audit_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "counterparty_idno" TEXT,
    "amount" DECIMAL(14,2),
    "details" JSONB,

    CONSTRAINT "reconciliation_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchase_invoice_id_idx" ON "supplier_payment_allocations"("purchase_invoice_id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_status_idx" ON "supplier_payment_allocations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_bank_transaction_id_purchase_i_key" ON "supplier_payment_allocations"("bank_transaction_id", "purchase_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_check_dismissals_signal_key_key" ON "settlement_check_dismissals"("signal_key");

-- CreateIndex
CREATE INDEX "reconciliation_audit_log_at_idx" ON "reconciliation_audit_log"("at");

-- CreateIndex
CREATE INDEX "reconciliation_audit_log_counterparty_idno_at_idx" ON "reconciliation_audit_log"("counterparty_idno", "at");

-- CreateIndex
CREATE INDEX "reconciliation_audit_log_action_idx" ON "reconciliation_audit_log"("action");

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

