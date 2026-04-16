#!/usr/bin/env bash
# Copy production PostgreSQL data into the local database defined by DATABASE_URL.
#
# Prerequisites: PostgreSQL client tools (pg_dump, psql) on PATH.
#
# Setup:
#   1. DATABASE_URL in .env → local DB (e.g. postgresql://postgres:postgres@localhost:5432/printupload)
#   2. Production URL (never commit): export PROD_DATABASE_URL='postgresql://...?sslmode=require'
#      Or put PROD_DATABASE_URL in .gitignored .env.local (this script loads .env then .env.local).
#   3. Non-interactive confirm: PRINTUPLOAD_CONFIRM_SYNC=YES npm run db:sync-from-prod
#
# Run:
#   npm run db:sync-from-prod
#
# Production is read-only (dump). Local DB is replaced with the dump contents (--clean drops objects first).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
# Optional: PROD_DATABASE_URL in .env.local (gitignored) — never commit production URLs.
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is not set. Add it to .env (see .env.example)." >&2
  exit 1
fi

SOURCE="${PROD_DATABASE_URL:-${SOURCE_DATABASE_URL:-}}"
if [ -z "$SOURCE" ]; then
  echo "error: Set PROD_DATABASE_URL (or SOURCE_DATABASE_URL) to your production PostgreSQL connection string." >&2
  echo "  Example: export PROD_DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require'" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found. Install PostgreSQL client tools (e.g. brew install libpq && brew link --force libpq)." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

echo "This will DROP and recreate schema objects in your LOCAL database (DATABASE_URL from .env)"
echo "using a snapshot from PRODUCTION (read-only dump). Production will not be modified."
echo ""
if [ "${PRINTUPLOAD_CONFIRM_SYNC:-}" = "YES" ]; then
  confirm="YES"
else
  read -r -p "Type YES to continue: " confirm
fi
if [ "${confirm}" != "YES" ]; then
  echo "Aborted."
  exit 1
fi

TMP="$(mktemp "${TMPDIR:-/tmp}/printupload-prod-dump.XXXXXX.sql")"
trap 'rm -f "${TMP}"' EXIT

echo "Dumping from production..."
pg_dump "${SOURCE}" --no-owner --no-acl --clean --if-exists -F p -f "${TMP}"

# Newer hosts (e.g. Neon / PG 17+) may emit SETs local PostgreSQL does not understand.
FILTERED="${TMP}.filtered"
grep -Ev '^SET[[:space:]]+transaction_timeout[[:space:]]*=' "${TMP}" > "${FILTERED}"
mv "${FILTERED}" "${TMP}"

echo "Restoring into local database..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${TMP}"

echo ""
echo "Done. Local DB now matches the production snapshot (schema + data)."
echo "Tip: npx prisma generate   (if needed)"
