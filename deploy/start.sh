#!/usr/bin/env bash
set -uo pipefail
cd /app

if [ -f .env.judge ]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^[A-Z_]+=' .env.judge)
  set +a
fi

if [ -n "${LT_USERNAME:-}" ] && [ -n "${LT_ACCESS_KEY:-}" ]; then
  kane-cli login --username "$LT_USERNAME" --access-key "$LT_ACCESS_KEY" \
    || echo "[deploy] kane login failed; verification will fail closed"
else
  echo "[deploy] LT_USERNAME/LT_ACCESS_KEY not set; Kane runs will fail closed"
fi

PUBLIC_PORT="${PORT:-4040}"
REFEREE_URL="http://localhost:${PUBLIC_PORT}"

PORT="${PUBLIC_PORT}" TEST_ROOT=apps/seller-honest LEDGER_PATH=.shroff/verdicts.ndjson DEMO_ROOT=/app \
DEMO_MAX_RUNS="${DEMO_MAX_RUNS:-40}" DEMO_COOLDOWN_SECONDS="${DEMO_COOLDOWN_SECONDS:-120}" \
  npx tsx packages/referee/src/cli.ts &
REFEREE_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "${REFEREE_URL}/identity" > /dev/null; then break; fi
  sleep 1
done

PORT=4021 PUBLIC_BASE_URL="http://localhost:4021" REFEREE_URL="$REFEREE_URL" \
  npx tsx apps/seller-honest/src/server.ts &
PORT=4022 PUBLIC_BASE_URL="http://localhost:4022" REFEREE_URL="$REFEREE_URL" FRAUD_MODE=bait \
  npx tsx apps/seller-evil/src/server.ts &
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
  PORT=4023 PUBLIC_BASE_URL="http://localhost:4023" REFEREE_URL="$REFEREE_URL" \
    npx tsx apps/seller-fiat/src/server.ts &
fi

wait "$REFEREE_PID"
