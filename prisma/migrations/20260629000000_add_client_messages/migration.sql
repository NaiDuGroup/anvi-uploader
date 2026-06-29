-- CreateTable
CREATE TABLE "client_messages" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "client_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_message_reads" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_message_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_messages_order_id_created_at_idx" ON "client_messages"("order_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "client_message_reads_order_id_user_id_key" ON "client_message_reads"("order_id", "user_id");

-- AddForeignKey
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_message_reads" ADD CONSTRAINT "client_message_reads_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
