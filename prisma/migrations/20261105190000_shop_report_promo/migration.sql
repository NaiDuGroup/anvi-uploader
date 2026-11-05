-- Storefront promo codes, the promo on storefront orders, and first-party
-- funnel events. Purely additive: two new tables, nullable columns on
-- "orders", new indexes, one FK with ON DELETE SET NULL.

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_order_mdl" DECIMAL(12,2),
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "max_uses_total" INTEGER,
    "max_uses_per_customer" INTEGER,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- Storefront orders: the promo applied at checkout.
ALTER TABLE "orders" ADD COLUMN "promo_code_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "promo_code" TEXT;
ALTER TABLE "orders" ADD COLUMN "promo_discount_mdl" DECIMAL(12,2);
ALTER TABLE "orders" ADD COLUMN "promo_data" JSONB;
ALTER TABLE "orders" ADD COLUMN "promo_counted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_promo_code_id_idx" ON "orders"("promo_code_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "shop_events" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT,
    "category" TEXT,
    "product" TEXT,
    "device" TEXT,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "lang" TEXT,

    CONSTRAINT "shop_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_events_created_at_idx" ON "shop_events"("created_at");
CREATE INDEX "shop_events_type_created_at_idx" ON "shop_events"("type", "created_at");
CREATE INDEX "shop_events_session_id_idx" ON "shop_events"("session_id");
