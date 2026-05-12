# Deployment Guide

This app is a single Next.js service (frontend + API routes). The recommended setup is:

| Service | Provider | What |
|---------|----------|------|
| App | **Vercel** | Next.js frontend + API routes |
| Database | **Render** | PostgreSQL (free tier available) |

---

## Step 1: Create PostgreSQL on Render

1. Go to [render.com](https://render.com) → **New** → **PostgreSQL**
2. Name it (e.g. `printupload-db`)
3. Select the **Free** plan
4. Click **Create Database**
5. Once created, copy the **Internal Database URL** (starts with `postgresql://...`)

---

## Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import this GitHub repo (`NaiDuGroup/anvi-uploader`)
3. In **Environment Variables**, add:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | The PostgreSQL URL from Render (step 1) |

4. Click **Deploy**

Vercel runs `npm install` (which runs **`prisma generate`** via `postinstall`), then **`npm run build`**.

The **`build`** script in `package.json` is:

`prisma migrate deploy` → `prisma generate` → `next build`

So **pending SQL migrations are applied during the Vercel build** as long as **`DATABASE_URL` is available for the Production (and Preview, if applicable) build environment** and Postgres accepts connections from Vercel’s build IPs.

**If `DATABASE_URL` is missing during build**, migrations will not run, `next build` may still succeed, and runtime can break when code expects new columns. Always keep **`DATABASE_URL`** configured for builds.

**Manual `migrate deploy`** (below) is still useful to verify state, recover from a failed build, or run from a trusted machine without redeploying.

---

## Step 3: Database migrations (production)

### During Vercel build (normal path)

No extra step if Production **`DATABASE_URL`** is set and the build log shows `prisma migrate deploy` completing without errors.

### Manual verification or recovery

From any host that can reach production Postgres (your laptop, CI one-off job, Render shell):

```bash
# Production connection string (Render “External” URL, or internal if same network)
export DATABASE_URL="postgresql://...your-render-url..."

# Apply all pending migrations (safe, idempotent)
npx prisma migrate deploy

# Confirm schema matches repo
npx prisma migrate status
```

If `migrate deploy` reports “No pending migrations”, the database already matches `prisma/migrations`.

**First-time setup only** — create admin users after migrations:

```bash
npx prisma db seed
```

---

## Production deploy checklist (safe rollout)

Use this before and after promoting a release to production.

### Before merge / deploy

1. On the release branch: **`npm run deploy:preflight`** (runs `npm run test` then `npm run build`; uses local `.env` `DATABASE_URL` — mirrors Vercel’s migration + build order). Equivalent manual steps: `npm ci`, `npm run test`, `npm run build`.
2. Confirm every migration under `prisma/migrations/` is committed and matches `schema.prisma`.
3. **Back up production Postgres** (Render snapshot or `pg_dump`) before deploying a release that adds migrations — schema rollbacks are awkward without a restore point.

### Vercel

1. **Settings → Environment Variables**: Production has **`DATABASE_URL`** pointing at the **production** database (not staging).
2. Merge to the branch Vercel deploys (e.g. `main`), wait for **successful** build + deploy.
3. If the build fails inside **`prisma migrate deploy`**, treat deploy as failed: read logs (DB connectivity, migration errors). Fix before retrying.

### After deploy

```bash
export DATABASE_URL="postgresql://…production…"
npx prisma migrate status
```

Expect the database to be up to date with no pending migrations.

**Smoke checks (about 5 minutes):**

| Step | Why |
|------|-----|
| Open `/` | Public SSR and dynamic routes |
| `/admin/login` → superadmin | Staff session |
| `/admin/settings` → save | Company profile + cabinet CTA flag |
| `/` in a private window | CTA visibility matches setting |
| Your critical flow (order / invoice) | Regression guard |

### If something goes wrong

- **Rollback app**: Vercel → redeploy / promote the previous successful Production deployment.
- **Schema already migrated**: Rolling back code only can mismatch the DB; restoring from the **pre-deploy backup** is the reliable undo for bad migrations.

---

## Step 4: Create admin users

The seed script creates two dev users:
- `admin` / `admin123` (Studio Admin)
- `workshop` / `workshop123` (Workshop)

**For production**, change the passwords in `prisma/seed.ts` before running the seed, or create users directly via SQL:

```sql
-- Connect to your Render PostgreSQL
-- Generate a password hash using: node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('YOUR_PASSWORD',s,64).toString('hex'))"

INSERT INTO users (id, name, role, password) VALUES (
  gen_random_uuid(), 'YourName', 'admin', 'salt:hash_from_above'
);
```

---

## Architecture

```
Client Browser
    ↓
Vercel (Next.js)
    ├── / (upload page — public)
    ├── /admin (dashboard — auth required)
    ├── /track/:token (order tracking — public)
    └── /api/* (API routes)
            ↓
    Render PostgreSQL
```

All in one Next.js app — no separate backend needed.

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |

---

## Notes

- The free Render PostgreSQL spins down after inactivity; first request may take ~30s
- Vercel free tier supports the full Next.js feature set including API routes and middleware
- File uploads are currently mocked — integrate AWS S3 for real file storage
