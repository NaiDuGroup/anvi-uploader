-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "client_id" TEXT;

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phone" TEXT,
    "phone_normalized" TEXT,
    "person_name" TEXT,
    "company_name" TEXT,
    "company_idno" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_phone_normalized_idx" ON "clients"("phone_normalized");

-- CreateIndex
CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
