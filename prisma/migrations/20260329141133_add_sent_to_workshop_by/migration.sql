-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "sent_to_workshop_by" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sent_to_workshop_by_fkey" FOREIGN KEY ("sent_to_workshop_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
