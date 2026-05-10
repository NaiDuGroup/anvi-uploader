-- Customer portal foundations:
--   * Mark studio customers as dealers (wholesale pricing).
--   * Optional email on the customer card (notifications, not login).
--   * Link User to StudioCustomer 1:1 + denormalized phone for fast login lookup.

-- AlterTable: clients
ALTER TABLE "clients"
ADD COLUMN "email" TEXT,
ADD COLUMN "is_dealer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: users
ALTER TABLE "users"
ADD COLUMN "studio_customer_id" TEXT,
ADD COLUMN "phone_normalized" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_studio_customer_id_key" ON "users"("studio_customer_id");
CREATE UNIQUE INDEX "users_phone_normalized_key" ON "users"("phone_normalized");

-- AddForeignKey
ALTER TABLE "users"
ADD CONSTRAINT "users_studio_customer_id_fkey"
FOREIGN KEY ("studio_customer_id") REFERENCES "clients"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
