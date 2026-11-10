-- «Взаиморасчёты» stage 1: purchase history backfill flag + counterparty
-- categories for bank payments. Additive only.
ALTER TABLE "purchase_invoices" ADD COLUMN "historical" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "purchase_invoices_historical_details_fetched_at_idx" ON "purchase_invoices"("historical", "details_fetched_at");

CREATE TABLE "counterparty_categories" (
    "id" TEXT NOT NULL,
    "idno" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "counterparty_categories_idno_key" ON "counterparty_categories"("idno");
