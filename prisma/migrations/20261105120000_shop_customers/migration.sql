-- Storefront customer accounts (magic link / code login), their one-time
-- login tokens, the e-mail log, and the link from storefront orders to the
-- account. Purely additive: new tables, two nullable columns, new indexes.

-- CreateTable
CREATE TABLE "shop_customers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "delivery" JSONB,
    "locale" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "shop_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_customers_email_key" ON "shop_customers"("email");

-- CreateTable
CREATE TABLE "shop_login_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "code_hash" TEXT,
    "email" TEXT NOT NULL,
    "customer_id" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_login_tokens_token_hash_key" ON "shop_login_tokens"("token_hash");
CREATE INDEX "shop_login_tokens_email_created_at_idx" ON "shop_login_tokens"("email", "created_at" DESC);
CREATE INDEX "shop_login_tokens_expires_at_idx" ON "shop_login_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "shop_login_tokens" ADD CONSTRAINT "shop_login_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "shop_customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "email_log" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lang" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_id" TEXT,
    "error" TEXT,
    "order_id" TEXT,
    "shop_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_log_order_id_created_at_idx" ON "email_log"("order_id", "created_at");
CREATE INDEX "email_log_created_at_idx" ON "email_log"("created_at");

-- Storefront orders → customer account + checkout language.
ALTER TABLE "orders" ADD COLUMN "shop_customer_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "shop_locale" TEXT;

-- CreateIndex
CREATE INDEX "orders_shop_customer_id_created_at_idx" ON "orders"("shop_customer_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_customer_id_fkey" FOREIGN KEY ("shop_customer_id") REFERENCES "shop_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
