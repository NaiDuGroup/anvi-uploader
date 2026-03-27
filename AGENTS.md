# AGENTS.md

## Overview

Print Upload System — a lightweight web-based system for managing print file uploads and internal processing in a print studio. Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Prisma (SQLite), Zustand, React Hook Form, and Zod.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Next.js Dev Server | `npm run dev` | 3000 | Frontend + API routes (single service) |
| SQLite (via Prisma) | embedded | — | No separate process needed; file-based DB at `prisma/dev.db` |

### Key commands

- **Dev server:** `npm run dev`
- **Lint:** `npx eslint .`
- **Type check:** `npx tsc --noEmit`
- **Build:** `npm run build`
- **DB migrate:** `npx prisma migrate dev`
- **DB generate client:** `npx prisma generate`

### Non-obvious caveats

- **Prisma v5** is used (not v7) because v7 requires a driver adapter for all providers including SQLite; v5 uses the built-in query engine and is simpler for local dev.
- The SQLite database file lives at `prisma/dev.db`. If you need a fresh DB, delete `prisma/dev.db` and re-run `npx prisma migrate dev`.
- S3 upload URLs are mocked in `/api/upload-url` — they return fake URLs for local development. Real S3 integration requires `AWS_*` environment variables.
- The `prisma/migrations/` directory is committed. Run `npx prisma migrate dev` after pulling to ensure the local DB is in sync.
- The `.env` file contains the `DATABASE_URL` for SQLite (`file:./dev.db`). This file is gitignored — if missing, create it with `DATABASE_URL="file:./dev.db"`.
