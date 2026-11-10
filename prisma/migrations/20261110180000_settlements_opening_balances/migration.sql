-- «Взаиморасчёты» stage 2: opening balances per counterparty (from 1C). Additive only.
CREATE TABLE "counterparty_opening_balances" (
    "id" TEXT NOT NULL,
    "idno" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparty_opening_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "counterparty_opening_balances_idno_key" ON "counterparty_opening_balances"("idno");
