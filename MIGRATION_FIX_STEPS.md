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
