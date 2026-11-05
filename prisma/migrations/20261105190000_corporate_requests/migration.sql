-- «Pentru companii» quote requests from the storefront. Purely additive: one
-- new table with its indexes; nothing existing changes.

-- CreateTable
CREATE TABLE "corporate_requests" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products_other" TEXT,
    "quantity" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "budget" TEXT,
    "has_logo" BOOLEAN NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "message" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'ro',
    "consent_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "assignee_id" TEXT,
    "notes" TEXT,
    "status_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "corporate_requests_number_key" ON "corporate_requests"("number");

-- CreateIndex
CREATE INDEX "corporate_requests_status_created_at_idx" ON "corporate_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "corporate_requests_created_at_idx" ON "corporate_requests"("created_at" DESC);
