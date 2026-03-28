-- AlterTable
ALTER TABLE "orders" ADD COLUMN "order_number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
