#!/usr/bin/env bash
set -euo pipefail

PORT="${WRANGLER_PORT:-8788}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="$(mktemp)"

# Disable wrangler telemetry prompts in CI.
export WRANGLER_SEND_METRICS=false

# Start wrangler dev in the background.
npx wrangler dev --local --port "$PORT" > "$LOG_FILE" 2>&1 &
WRANGLER_PID=$!

cleanup() {
  echo "Shutting down wrangler dev (PID: $WRANGLER_PID)..."
  kill "$WRANGLER_PID" 2>/dev/null || true
  wait "$WRANGLER_PID" 2>/dev/null || true
  # Also terminate any lingering wrangler/workerd processes for this port.
  pkill -f "wrangler dev --local --port $PORT" 2>/dev/null || true
  pkill -f "workerd serve.*port $PORT" 2>/dev/null || true
  rm -f "$LOG_FILE"
}
trap cleanup EXIT

# Wait for the local server to be ready.
echo "Waiting for wrangler dev on $BASE_URL ..."
for _ in $(seq 1 30); do
  if curl -fsS "$BASE_URL/auth/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Verify /auth/health
echo "Testing /auth/health ..."
HEALTH=$(curl -fsS "$BASE_URL/auth/health")
if [[ "$HEALTH" != '{"status":"ok"}' ]]; then
  echo "FAIL: expected {\"status\":\"ok\"}, got $HEALTH"
  cat "$LOG_FILE"
  exit 1
fi
echo "OK: /auth/health -> $HEALTH"

# Verify root serves the SPA shell.
echo "Testing / (SPA shell) ..."
ROOT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/")
if [[ "$ROOT_STATUS" != "200" ]]; then
  echo "FAIL: expected 200 for /, got $ROOT_STATUS"
  cat "$LOG_FILE"
  exit 1
fi
echo "OK: / -> $ROOT_STATUS"

# Verify a client-side route falls back to the SPA shell when navigated to.
echo "Testing /marketplace (SPA fallback) ..."
MARKET_STATUS=$(curl -s -H "Sec-Fetch-Mode: navigate" -o /dev/null -w "%{http_code}" "$BASE_URL/marketplace")
if [[ "$MARKET_STATUS" != "200" ]]; then
  echo "FAIL: expected 200 for /marketplace with navigate header, got $MARKET_STATUS"
  cat "$LOG_FILE"
  exit 1
fi
echo "OK: /marketplace (navigate) -> $MARKET_STATUS"

# Verify a static asset is served.
echo "Testing static asset ..."
ASSET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/index.html")
if [[ "$ASSET_STATUS" != "307" && "$ASSET_STATUS" != "200" ]]; then
  echo "FAIL: expected 307 or 200 for /index.html, got $ASSET_STATUS"
  cat "$LOG_FILE"
  exit 1
fi
echo "OK: /index.html -> $ASSET_STATUS"

echo ""
echo "All worker integration tests passed."
