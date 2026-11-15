#!/usr/bin/env bash
# int1: runs the shell guard (scripts/check-shell-layout.mjs, rules 1 to 15) against a production build, as a step of the full
# scripts/check.sh. It builds the server (the built web/dist is embedded), starts it DETACHED on this worktree's page-layout port + 2
# with a scratch data dir under build/ (the guard fakes /api/me and answers every other API call itself, so nothing is seeded), runs
# the guard with a time limit, and always stops the server. Rule 16 needs the Vite dev server and reports itself not run here.
# Exit: the guard's (0 OK, 1 findings); 1 when the server cannot be built or started. No Chrome or no web build: a WARN, exit 0 (as the
# page layout guard). Overrides: SHELL_LAYOUT_PORT, SHELL_LAYOUT_TIMEOUT (900 s), CHROME.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
mkdir -p "$BUILD"
PORT="${SHELL_LAYOUT_PORT:-$(( $(bash "$ROOT/scripts/check-page-layout.sh" --print-port) + 2 ))}"
URL="http://127.0.0.1:$PORT"
DATA="$BUILD/shell-layout-data"
LOG="$BUILD/shell-layout-server.log"
BIN="$BUILD/shell-layout-feeder"
CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)}"

if [ -z "$CHROME_BIN" ]; then echo "shell layout guard: WARN: no Chrome, not run"; exit 0; fi
if [ ! -f "$ROOT/web/dist/index.html" ]; then echo "shell layout guard: WARN: no web build, not run"; exit 0; fi
if ! (cd "$ROOT" && go build -buildvcs=false -o "$BIN" ./cmd/feeder) >"$LOG" 2>&1; then
  echo "shell layout guard: FAILED: go build (see $LOG)" >&2; exit 1
fi
if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then echo "shell layout guard: FAILED: port $PORT is busy" >&2; exit 1; fi

rm -rf "$DATA"; mkdir -p "$DATA"
PIDFILE="$BUILD/shell-layout-server.pid"
stop() {
  [ -s "$PIDFILE" ] || return 0
  local pid; pid="$(cat "$PIDFILE")"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 25); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
  kill -KILL -- "-$pid" 2>/dev/null
  rm -f "$PIDFILE"
}
trap stop EXIT
FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR="$DATA" FEEDER_ADDR="127.0.0.1:$PORT" PORT="$PORT" \
  setsid nohup bash -c 'echo $$ >"$0"; exec "$1"' "$PIDFILE" "$BIN" >>"$LOG" 2>&1 </dev/null &
ready=""
for _ in $(seq 1 150); do
  if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then ready=1; break; fi
  sleep 0.2
done
[ -n "$ready" ] || { echo "shell layout guard: FAILED: the server did not start on $URL (see $LOG)" >&2; exit 1; }

timeout -k 10 "${SHELL_LAYOUT_TIMEOUT:-900}" node "$ROOT/scripts/check-shell-layout.mjs" --url "$URL" --chrome "$CHROME_BIN"
