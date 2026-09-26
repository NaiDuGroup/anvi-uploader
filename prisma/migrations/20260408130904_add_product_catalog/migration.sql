-- AlterTable (idempotent: only add columns if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'category_id') THEN
    ALTER TABLE "orders" ADD COLUMN "category_id" TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'price_auto_calculated') THEN
    ALTER TABLE "orders" ADD COLUMN "price_auto_calculated" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'price_tier') THEN
    ALTER TABLE "orders" ADD COLUMN "price_tier" TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'product_id') THEN
    ALTER TABLE "orders" ADD COLUMN "product_id" TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'quantity') THEN
    ALTER TABLE "orders" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
  END IF;
END $$;

-- CreateTable (idempotent: only create if doesn't exist)
CREATE TABLE IF NOT EXISTS "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "pricing_model" TEXT NOT NULL DEFAULT 'fixed',
    "has_customizer" BOOLEAN NOT NULL DEFAULT false,
    "customizer_type" TEXT,
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable (idempotent: only create if doesn't exist)
CREATE TABLE IF NOT EXISTS "products" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "color" TEXT,
    "color_hex" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "retail_price" INTEGER,
    "dealer_price" INTEGER,
    "wholesale_price" INTEGER,
    "wholesale_min_qty" INTEGER DEFAULT 10,
    "material_cost_per_sqm" INTEGER,
    "print_cost_per_sqm" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_customer_material" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'product_categories_slug_key') THEN
    CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'products_sku_key') THEN
    CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'products_category_id_idx') THEN
    CREATE INDEX "products_category_id_idx" ON "products"("category_id");
  END IF;
END $$;

-- CreateIndex (idempotent: only create if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orders_category_id_idx') THEN
    CREATE INDEX "orders_category_id_idx" ON "orders"("category_id");
  END IF;
END $$;

-- AddForeignKey (idempotent: only add if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'products_category_id_fkey') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent: only add if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_category_id_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (idempotent: only add if doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'orders_product_id_fkey') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
