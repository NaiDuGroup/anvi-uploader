-- Switch MDL money columns on orders + mug/notebook catalogs from
-- INTEGER (whole lei) to DECIMAL(12, 2) so admins can record bani
-- (e.g. `1.50 lei per piece`). Existing integer values are widened
-- in place without data loss.
--
-- LF roll material prices, ink stock costs, BusinessExpense.amount,
-- and the productionCosts JSON config stay INTEGER for now; they
-- have their own rounding policies and will be migrated separately
-- if needed.

ALTER TABLE "orders"
  ALTER COLUMN "price" TYPE DECIMAL(12, 2);

ALTER TABLE "mug_products"
  ALTER COLUMN "sell_price"    TYPE DECIMAL(12, 2),
  ALTER COLUMN "dealer_price"  TYPE DECIMAL(12, 2),
  ALTER COLUMN "purchase_cost" TYPE DECIMAL(12, 2);

ALTER TABLE "notebook_products"
  ALTER COLUMN "sell_price"    TYPE DECIMAL(12, 2),
  ALTER COLUMN "dealer_price"  TYPE DECIMAL(12, 2),
  ALTER COLUMN "purchase_cost" TYPE DECIMAL(12, 2);
