#!/usr/bin/env bash
set -euo pipefail

# Safety guard: integration/E2E tests create orders and users. A DATABASE_URL
# exported in the calling shell (e.g. left over from inspecting the production
# DB) is inherited by `npm run start` and would silently point the whole run
# at production. Refuse to start unless the URL targets a local database.
if [[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" != *"localhost"* && "$DATABASE_URL" != *"127.0.0.1"* ]]; then
  echo "ERROR: DATABASE_URL is set to a non-local host — refusing to run tests against it." >&2
  echo "       Unset DATABASE_URL (tests use the local URL from .env) and retry." >&2
  exit 1
fi

PORT="${PORT:-3100}"
export PORT
export R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-local-dev}"
export TEST_BASE_URL="http://127.0.0.1:${PORT}"
export PLAYWRIGHT_BASE_URL="$TEST_BASE_URL"

npm run start &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
}
trap cleanup EXIT

npx wait-on "tcp:127.0.0.1:${PORT}" -t 120000

npm run test:integration
npx playwright test
