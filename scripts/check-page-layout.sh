#!/usr/bin/env bash
# R2-L page-layout guard wrapper (design: docs/dev/design/r2l-page-layout.md section 5).
# Builds the server, starts it DETACHED on a worktree-unique port with a scratch data dir, seeds it, runs the CDP guard
# (scripts/check-page-layout.mjs), stops the server on EVERY exit path, and maps findings to warn/fail per route
# (scripts/check-page-layout.modes). Environment trouble (no Chrome, build/seed/server failure) is a SKIP/WARN, never a failed check.
#   scripts/check-page-layout.sh                 quick profile (390, 1440, 1920)
#   PAGE_LAYOUT=full scripts/check-page-layout.sh    six viewports (release QA)
#   PAGE_LAYOUT=skip ...                          do nothing
#   scripts/check-page-layout.sh --print-port [--root DIR]    the port this worktree uses (20000 + cksum(DIR) % 20000)
#   scripts/check-page-layout.sh --mode-of ROUTE              warn|fail for a route
# Overrides (tests): PAGE_LAYOUT_BUILD_DIR, PAGE_LAYOUT_PORT, PAGE_LAYOUT_MODES, PAGE_LAYOUT_SERVER_CMD, PAGE_LAYOUT_SEED_CMD,
# PAGE_LAYOUT_GUARD_CMD, CHROME.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODES="${PAGE_LAYOUT_MODES:-$ROOT/scripts/check-page-layout.modes}"

port_for() { echo $((20000 + $(printf '%s' "$1" | cksum | cut -d' ' -f1) % 20000)); }

case "${1:-}" in
  --print-port)
    root="$ROOT"
    if [ "${2:-}" = "--root" ] && [ -n "${3:-}" ]; then root="$3"; fi
    port_for "$root"
    exit 0
    ;;
  --mode-of)
    node "$ROOT/scripts/lib/page-layout-modes.mjs" mode-of "$MODES" "${2:-}"
    exit $?
    ;;
esac

MODE="${PAGE_LAYOUT:-quick}"
if [ "$MODE" = skip ]; then
  echo "page layout guard: skipped (PAGE_LAYOUT=skip)"
  exit 0
fi
PROFILE=quick
[ "$MODE" = full ] && PROFILE=full

CHROME="${CHROME:-google-chrome}"
export CHROME
if ! command -v "$CHROME" >/dev/null 2>&1; then
  echo "SKIP: Chrome not found ($CHROME); set CHROME=/path/to/chrome to run the page layout guard"
  exit 0
fi

BUILD="${PAGE_LAYOUT_BUILD_DIR:-$ROOT/build}"
PORT="${PAGE_LAYOUT_PORT:-$(port_for "$ROOT")}"
URL="http://127.0.0.1:$PORT"
DATA="$BUILD/page-layout-data"
LOG="$BUILD/page-layout-server.log"
PIDFILE="$BUILD/page-layout-server.pid"
IDS="$BUILD/page-layout-ids.json"
OUT="$BUILD/page-layout-guard.out"
mkdir -p "$BUILD"

SERVER_PID=""
GUARD_PID=""
stop_server() {
  if [ -n "${GUARD_PID:-}" ] && kill -0 "$GUARD_PID" 2>/dev/null; then
    kill -TERM "$GUARD_PID" 2>/dev/null
    pkill -TERM -P "$GUARD_PID" 2>/dev/null
  fi
  local pid="${SERVER_PID:-}"
  [ -z "$pid" ] && [ -s "$PIDFILE" ] && pid="$(cat "$PIDFILE" 2>/dev/null)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    fi
  fi
  SERVER_PID=""
  rm -f "$PIDFILE"
}
trap stop_server EXIT
trap 'exit 130' INT TERM HUP

# Never touch a server that is not ours.
if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then
  echo "WARN: something already listens on $URL; page layout guard not run (set PAGE_LAYOUT_PORT to another port)"
  exit 0
fi

if [ -z "${PAGE_LAYOUT_SERVER_CMD:-}" ]; then
  if ! (cd "$ROOT" && go build -buildvcs=false -o "$BUILD/feeder" ./cmd/feeder) >"$BUILD/page-layout-build.log" 2>&1; then
    echo "WARN: go build failed, page layout guard not run (see $BUILD/page-layout-build.log)"
    exit 0
  fi
  SERVER_CMD="$BUILD/feeder"
else
  SERVER_CMD="$PAGE_LAYOUT_SERVER_CMD"
fi

rm -rf "$DATA" "$IDS"
mkdir -p "$DATA"
: >"$LOG"
rm -f "$PIDFILE"

# Detached (own session and process group), loopback only, scratch data dir, dev login.
FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR="$DATA" FEEDER_ADDR="127.0.0.1:$PORT" PORT="$PORT" \
  setsid nohup bash -c 'echo $$ >"$1"; shift; exec '"$SERVER_CMD" _ "$PIDFILE" >>"$LOG" 2>&1 </dev/null &
SERVER_PID=$!

ready=""
for _ in $(seq 1 150); do
  if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then ready=1; break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.2
done
if [ -z "$ready" ]; then
  echo "WARN: the page layout server did not start on $URL (see $LOG); guard not run"
  exit 0
fi
[ -s "$PIDFILE" ] && SERVER_PID="$(cat "$PIDFILE")"

SEED_CMD="${PAGE_LAYOUT_SEED_CMD:-node $ROOT/scripts/test/fixtures/page-layout-seed.mjs}"
if ! (cd "$ROOT" && bash -c "$SEED_CMD \"\$@\"" _ "$URL" --out "$IDS") >"$BUILD/page-layout-seed.log" 2>&1; then
  echo "WARN: seeding failed, page layout guard not run (see $BUILD/page-layout-seed.log)"
  exit 0
fi

GUARD_CMD="${PAGE_LAYOUT_GUARD_CMD:-node $ROOT/scripts/check-page-layout.mjs}"
LIMIT=""
command -v timeout >/dev/null 2>&1 && LIMIT="timeout 900"
START=$SECONDS
# In the background and waited for, so a signal reaches the trap at once (bash defers traps while a foreground command runs).
(cd "$ROOT" && exec $LIMIT bash -c "$GUARD_CMD \"\$@\"" _ --url "$URL" --profile "$PROFILE" --ids "$IDS") >"$OUT" 2>&1 &
GUARD_PID=$!
wait "$GUARD_PID"
RC=$?
GUARD_PID=""
ELAPSED=$((SECONDS - START))

if [ "$RC" -eq 0 ]; then
  cat "$OUT"
  echo "page layout guard: OK ($PROFILE profile, ${ELAPSED}s)"
  exit 0
fi
if [ "$RC" -ne 1 ]; then
  cat "$OUT"
  echo "WARN: the page layout guard could not run (exit $RC, ${ELAPSED}s); not a layout finding"
  exit 0
fi

N="$(grep -cE '^[[:space:]]+- [0-9]+px ' "$OUT")"
BYRULE="$(grep -oE '^[[:space:]]+- [0-9]+px [^:]+: P[0-9]+' "$OUT" | grep -oE 'P[0-9]+$' | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
FAILN="$(node "$ROOT/scripts/lib/page-layout-modes.mjs" count-fail "$MODES" <"$OUT" 2>/dev/null || echo 0)"
cat "$OUT"
if [ "${FAILN:-0}" -gt 0 ]; then
  echo "page layout guard FAILED: $FAILN finding(s) on routes in fail mode (scripts/check-page-layout.modes); $N in total ($BYRULE), ${ELAPSED}s"
  exit 1
fi
echo "WARN: $N page-layout findings (warn mode) [$BYRULE] ($PROFILE profile, ${ELAPSED}s); flip routes in scripts/check-page-layout.modes as they are migrated"
exit 0
