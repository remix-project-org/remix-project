#!/usr/bin/env bash

set -euo pipefail

PROJECT=${PLAYWRIGHT_PROJECT:-chromium}
SPEC=${PLAYWRIGHT_SPEC:-}
DIST_DIR=${REMIX_DIST_DIR:-./dist/apps/remix-ide}
BASE_URL=${REMIX_BASE_URL:-http://127.0.0.1:8080}
LOG_DIR=${REMIX_SERVER_LOG_DIR:-./tmp}
LOG_FILE=${REMIX_SERVER_LOG_FILE:-${LOG_DIR}/remix-serve.log}

mkdir -p "$LOG_DIR"
: > "$LOG_FILE"

if [ ! -d "$DIST_DIR" ]; then
  echo "Missing dist directory: $DIST_DIR"
  ls -la ./dist || true
  ls -la ./dist/apps || true
  exit 1
fi

echo "Starting Remix dist server from $DIST_DIR"
npx http-server "$DIST_DIR" -a 127.0.0.1 -p 8080 > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "Waiting for Remix on $BASE_URL"
ready=0
for i in $(seq 1 120); do
  if curl -sf "$BASE_URL" >/dev/null; then
    ready=1
    break
  fi

  # Surface a fast failure if the server process crashed.
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Remix server exited before becoming ready"
    tail -n 200 "$LOG_FILE" || true
    exit 1
  fi

  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "Remix did not become ready in time"
  tail -n 200 "$LOG_FILE" || true
  exit 1
fi

echo "Remix is up. Running Playwright tests (project=$PROJECT spec=${SPEC:-<all>})"
if [ -n "$SPEC" ]; then
  yarn playwright test "$SPEC" --project="$PROJECT"
else
  yarn playwright test --project="$PROJECT"
fi
