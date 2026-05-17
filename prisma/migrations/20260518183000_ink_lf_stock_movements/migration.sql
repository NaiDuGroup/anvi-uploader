-- Audit trail for ink tank consumption / returns tied to orders.
CREATE TABLE "ink_stock_movements" (
    "id" TEXT NOT NULL,
    "ink_inventory_id" TEXT NOT NULL,
    "quantity_ml" DECIMAL(16,3) NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "ink_cost_mdl" INTEGER,
    "ink_sell_price_mdl" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ink_stock_movements_pkey" PRIMARY KEY ("id")
);

-- Audit trail for wide-format roll stock consumption / returns.
CREATE TABLE "lf_roll_stock_movements" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_lm" DECIMAL(14,4) NOT NULL,
    "kind" TEXT NOT NULL,
    "order_id" TEXT,
    "order_number" INTEGER,
    "order_line_id" TEXT,
    "material_cost_mdl" INTEGER,
    "material_sell_price_mdl" INTEGER,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lf_roll_stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ink_stock_movements_ink_inventory_id_created_at_idx" ON "ink_stock_movements"("ink_inventory_id", "created_at" DESC);
CREATE INDEX "ink_stock_movements_order_id_idx" ON "ink_stock_movements"("order_id");

CREATE INDEX "lf_roll_stock_movements_material_id_created_at_idx" ON "lf_roll_stock_movements"("material_id", "created_at" DESC);
CREATE INDEX "lf_roll_stock_movements_order_id_idx" ON "lf_roll_stock_movements"("order_id");

ALTER TABLE "ink_stock_movements" ADD CONSTRAINT "ink_stock_movements_ink_inventory_id_fkey" FOREIGN KEY ("ink_inventory_id") REFERENCES "ink_inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ink_stock_movements" ADD CONSTRAINT "ink_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ink_stock_movements" ADD CONSTRAINT "ink_stock_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ink_stock_movements" ADD CONSTRAINT "ink_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lf_roll_stock_movements" ADD CONSTRAINT "lf_roll_stock_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "large_format_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lf_roll_stock_movements" ADD CONSTRAINT "lf_roll_stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lf_roll_stock_movements" ADD CONSTRAINT "lf_roll_stock_movements_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lf_roll_stock_movements" ADD CONSTRAINT "lf_roll_stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
