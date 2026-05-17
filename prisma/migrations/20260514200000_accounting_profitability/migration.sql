-- AlterTable
ALTER TABLE "mug_products" ADD COLUMN "purchase_cost" INTEGER;
ALTER TABLE "notebook_products" ADD COLUMN "purchase_cost" INTEGER;

-- CreateTable
CREATE TABLE "accounting_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "production_costs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_expenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_expenses_is_active_idx" ON "business_expenses"("is_active");

-- CreateIndex
CREATE INDEX "business_expenses_start_date_idx" ON "business_expenses"("start_date");

-- Ensure default accounting settings row exists
INSERT INTO "accounting_settings" ("id", "production_costs", "created_at", "updated_at")
VALUES ('default', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
