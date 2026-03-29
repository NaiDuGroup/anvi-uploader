-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "client_name" TEXT,
ADD COLUMN     "created_by" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
