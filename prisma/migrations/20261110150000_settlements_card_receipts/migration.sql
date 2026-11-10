-- «Взаиморасчёты»: card purchases → suppliers, supplier invoices paid by
-- fiscal receipt (B/f). Additive only.
ALTER TABLE "purchase_invoices" ADD COLUMN "receipt_ref" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN "receipt_method" TEXT;
ALTER TABLE "purchase_invoices" ADD COLUMN "receipt_settled_at" TIMESTAMP(3);
ALTER TABLE "purchase_invoices" ADD COLUMN "receipt_checked_at" TIMESTAMP(3);

CREATE TABLE "card_merchant_aliases" (
    "id" TEXT NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "idno" TEXT,
    "name" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_merchant_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_merchant_aliases_merchant_key_key" ON "card_merchant_aliases"("merchant_key");
