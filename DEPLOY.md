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

Vercel will automatically run `npm install` → `prisma generate` → `next build`.

**Vercel does not apply SQL migrations.** The production database is updated only when you run `prisma migrate deploy` (see below).

---

## Step 3: Run database migrations (production)

Do this **after every deploy** that adds or changes files under `prisma/migrations/`, and **once** when you first go live.

From your machine (or any host that can reach the production Postgres URL):

```bash
# Production connection string (Render “External” URL, or internal if same network)
export DATABASE_URL="postgresql://...your-render-url..."

# Apply all pending migrations (safe, idempotent)
npx prisma migrate deploy

# Optional: check status
npx prisma migrate status
```

**First-time setup only** — create admin users after migrations:

```bash
npx prisma db seed
```

You can also run `npx prisma migrate deploy` from a one-off shell if your host has Node and this repo (e.g. GitHub Action, Render shell, or `vercel env pull` + local terminal).

If `migrate deploy` reports “No pending migrations”, the database already matches `prisma/migrations` and no action is needed.

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
