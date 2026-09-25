# P3009 Migration Fix - Manual Steps Required

## Root Cause
Migration `20260408130904_add_product_catalog` failed partway through execution in the Neon database, leaving it marked as FAILED in the `_prisma_migrations` table. The migration was non-idempotent, so re-running it would fail on already-created objects.

## Fix Applied
✅ **Commit 7bfb4bc**: Made the migration SQL fully idempotent with conditional checks for:
- Column additions (using `information_schema.columns` checks)
- Table creation (using `CREATE TABLE IF NOT EXISTS`)
- Index creation (using `pg_indexes` checks)
- Foreign key constraints (using `information_schema.table_constraints` checks)

## Database Resolution Steps

To resolve the stuck migration in Neon, run these commands **against the Vercel Preview/Production Neon database**:

### Option 1: If migration is partially applied (most likely)

```bash
# Use DIRECT_DATABASE_URL (non-pooler connection) for migrations
export DATABASE_URL="<DIRECT_DATABASE_URL from Vercel>"

# Mark the failed migration as rolled back
npx prisma migrate resolve --rolled-back 20260408130904_add_product_catalog

# Re-run migrations (the idempotent SQL will now succeed)
npx prisma migrate deploy
```

### Option 2: If migration fully completed but marked as failed

```bash
export DATABASE_URL="<DIRECT_DATABASE_URL from Vercel>"

# Mark it as successfully applied
npx prisma migrate resolve --applied 20260408130904_add_product_catalog

# Continue with remaining migrations
npx prisma migrate deploy
```

### How to determine which option?

Connect to the Neon database and check:

```sql
-- Check migration status
SELECT * FROM _prisma_migrations 
WHERE migration_name = '20260408130904_add_product_catalog';

-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('product_categories', 'products');

-- Check if columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('category_id', 'product_id', 'quantity', 'price_tier', 'price_auto_calculated');
```

**If tables/columns exist**: Use Option 2 (`--applied`)  
**If tables/columns don't exist or partial**: Use Option 1 (`--rolled-back`)

## Getting Neon Credentials

From Vercel Dashboard:
1. Go to your project: https://vercel.com/naidugroup/anvi-uploader
2. Settings → Environment Variables
3. Copy `DIRECT_DATABASE_URL` (or `DATABASE_URL` if DIRECT_DATABASE_URL not set)
4. **Use the direct (non-pooler) connection** for migrations

## Next Steps

After running the resolve command:
1. Trigger a new Vercel Preview deployment (push a commit or re-run the build)
2. The `npm run build` → `prisma migrate deploy` step should now succeed
3. Subsequent migration `20260420115248_add_mug_products` will clean up these tables anyway

## Context

This migration was later superseded by `20260420115248_add_mug_products`, which:
- Drops `product_categories` and `products` tables
- Drops the temporary columns from `orders`
- Replaces with `mug_products` table

So the stuck migration just needs to complete (even if idempotently) so that the rollback migration can run.

---

## P3018 Follow-up Fix (20260420115248_add_mug_products)

### Error After P3009 Resolution

After resolving P3009 and re-running migrations, a new error appeared:

```
Error: P3018
Migration name: 20260420115248_add_mug_products
Database error code: 2BP01
ERROR: cannot drop table product_categories because other objects depend on it
DETAIL: constraint order_items_category_id_fkey on table order_items depends on table product_categories
```

### Root Cause

An `order_items` table (not tracked in migrations) existed in the Neon database with foreign key constraints to `product_categories` and `products`. The migration attempted to drop these tables without first dropping the dependent constraints.

### Fix Applied

**Commit 797aa5c**: Made the entire migration idempotent and added pre-drop FK cleanup:

1. **Added `order_items` FK drops** (before table drops):
   - `order_items_category_id_fkey` → `product_categories`
   - `order_items_product_id_fkey` → `products`

2. **Made all operations idempotent**:
   - FK drops: wrapped in `DO $$ ... IF EXISTS ... END $$`
   - Column drops/adds: checked via `information_schema.columns`
   - Table drops: `DROP TABLE IF EXISTS`
   - Index operations: checked via `pg_indexes`
   - Constraint additions: checked via `information_schema.table_constraints`

### Resolution Steps

```bash
export DATABASE_URL="<DIRECT_DATABASE_URL from Vercel>"

# Mark the failed migration as rolled back
npx prisma migrate resolve --rolled-back 20260420115248_add_mug_products

# Re-deploy (idempotent SQL will now succeed)
npx prisma migrate deploy
```

The migration now safely handles the `order_items` dependencies and can be re-run without errors.

