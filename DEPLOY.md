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

---

## Step 3: Run database migration

After the first deploy, you need to run the migration once. You can do this from your local machine:

```bash
# Set the production DATABASE_URL
export DATABASE_URL="postgresql://...your-render-url..."

# Run migrations
npx prisma migrate deploy

# Create your admin users
npx prisma db seed
```

Or from Vercel's terminal / Render shell.

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
