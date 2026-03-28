# AGENTS.md

## Overview

Print Upload System — a lightweight web-based system for managing print file uploads and internal processing in a print studio. Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Prisma (PostgreSQL), Zustand, React Hook Form, and Zod.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Next.js Dev Server | `npm run dev` | 3000 | Frontend + API routes (single service) |
| PostgreSQL | system service | 5432 | Must be running; local dev DB: `printupload` |

### Key commands

- **Dev server:** `npm run dev`
- **Lint:** `npx eslint .`
- **Type check:** `npx tsc --noEmit`
- **Build:** `npm run build`
- **DB migrate (dev):** `npx prisma migrate dev`
- **DB migrate (prod):** `npx prisma migrate deploy`
- **DB generate client:** `npx prisma generate`
- **DB seed (create dev admin):** `npx prisma db seed`

### Non-obvious caveats

- **Prisma v5** is used (not v7) because v7 requires a driver adapter; v5 uses the built-in query engine.
- **PostgreSQL** is required. For local dev, start PostgreSQL with `sudo pg_ctlcluster 16 main start`. The local dev DB is `printupload` with user `printadmin`/`printadmin`. The user needs `CREATEDB` permission for `prisma migrate dev` (shadow database).
- **Login API field:** The `/api/auth/login` endpoint expects `{ name, password }` (not `username`).
- S3 upload URLs are mocked in `/api/upload-url` — they return fake URLs for local development.
- The `prisma/migrations/` directory is committed. Run `npx prisma migrate dev` after pulling to ensure the local DB is in sync.
- The `.env` file contains `DATABASE_URL` for PostgreSQL. This file is gitignored — if missing, create it from `.env.example`.
- **Admin authentication:** The admin panel (`/admin`) is protected by session-cookie auth. Middleware redirects to `/admin/login`. API routes `GET /api/orders` and `PATCH /api/orders/:id` return 401 without a valid session. Dev credentials: `admin`/`admin123` and `workshop`/`workshop123` (created via `npx prisma db seed`).
- **Roles:** `admin` sees all orders; `workshop` sees only orders with `isWorkshop=true`. Workshop cannot set unauthorized statuses.
- **i18n:** Three languages (Romanian default, Russian, English). Preference stored in `localStorage` under key `print-upload-lang`.
- **Deployment:** See `DEPLOY.md` for Vercel + Render PostgreSQL deployment guide.
