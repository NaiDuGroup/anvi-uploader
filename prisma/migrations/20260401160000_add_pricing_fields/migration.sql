-- ProductCategory: pricing model, service price, dimensions required
ALTER TABLE "product_categories" ADD COLUMN "pricing_model" TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE "product_categories" ADD COLUMN "service_price_default" DOUBLE PRECISION;
ALTER TABLE "product_categories" ADD COLUMN "dimensions_required" BOOLEAN NOT NULL DEFAULT false;

-- Product: cost price, selling price
ALTER TABLE "products" ADD COLUMN "cost_price" DOUBLE PRECISION;
ALTER TABLE "products" ADD COLUMN "selling_price" DOUBLE PRECISION;

-- OrderItem: width, height, unit price, total price, price override
ALTER TABLE "order_items" ADD COLUMN "width" DOUBLE PRECISION;
ALTER TABLE "order_items" ADD COLUMN "height" DOUBLE PRECISION;
ALTER TABLE "order_items" ADD COLUMN "unit_price" DOUBLE PRECISION;
ALTER TABLE "order_items" ADD COLUMN "total_price" DOUBLE PRECISION;
ALTER TABLE "order_items" ADD COLUMN "price_override" BOOLEAN NOT NULL DEFAULT false;

-- Order: total price
ALTER TABLE "orders" ADD COLUMN "total_price" DOUBLE PRECISION;
