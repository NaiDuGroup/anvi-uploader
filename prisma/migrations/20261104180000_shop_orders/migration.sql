-- Storefront (shop) orders: source, online payment state, customer, delivery.
-- Purely additive: new nullable columns or columns with constant defaults,
-- one new index. Existing rows become source='studio', payment_status='unpaid'.
ALTER TABLE "orders" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'studio';
ALTER TABLE "orders" ADD COLUMN "payment_status" TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE "orders" ADD COLUMN "payment_provider" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_ref" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_name" TEXT;
ALTER TABLE "orders" ADD COLUMN "customer_email" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_method" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_city" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_address" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_note" TEXT;
ALTER TABLE "orders" ADD COLUMN "delivery_price_mdl" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "tracking_number" TEXT;
ALTER TABLE "orders" ADD COLUMN "shipped_at" TIMESTAMP(3);

-- Storefront cart line as the customer saw it (title, options, note, price).
ALTER TABLE "order_lines" ADD COLUMN "shop_line_data" JSONB;

-- CreateIndex
CREATE INDEX "orders_source_created_at_idx" ON "orders"("source", "created_at" DESC);
