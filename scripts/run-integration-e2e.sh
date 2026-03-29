#!/usr/bin/env bash
set -euo pipefail
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
