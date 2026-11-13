#!/usr/bin/env bash
# R2-L page-layout guard wrapper (design: docs/dev/design/r2l-page-layout.md section 5; coverage: docs/dev/design/b5-pl.md).
# Builds the server, starts it DETACHED on a worktree-unique port with a scratch data dir, seeds it, runs the CDP guard
# (scripts/check-page-layout.mjs), stops the server it started on EVERY exit path, and maps findings to warn/fail per route
# (scripts/check-page-layout.modes).
# Coverage: a route x viewport that was not inspected FAILS in every mode. Rule findings are warn/fail by the modes file.
# A refused run (a busy port, or a second run in this worktree) FAILS in every mode: it means a concurrent run.
# A guard that did not run for environment trouble (no Chrome, no web build, seed or server failure) is a SKIP/WARN in quick,
# and a FAILED run in full (PAGE_LAYOUT=full, release QA).
#   scripts/check-page-layout.sh                 quick profile (390, 1440, 1920)
#   PAGE_LAYOUT=full scripts/check-page-layout.sh    six viewports (release QA)
#   PAGE_LAYOUT=skip ...                          do nothing
#   scripts/check-page-layout.sh --print-port [--root DIR]    the port this worktree uses (20000 + cksum(DIR) % 20000)
#   scripts/check-page-layout.sh --mode-of ROUTE              warn|fail for a route
# Overrides (tests): PAGE_LAYOUT_BUILD_DIR, PAGE_LAYOUT_PORT, PAGE_LAYOUT_MODES, PAGE_LAYOUT_SERVER_CMD, PAGE_LAYOUT_SEED_CMD,
# PAGE_LAYOUT_GUARD_CMD, PAGE_LAYOUT_GUARD_TIMEOUT (300 s), PAGE_LAYOUT_SEED_TIMEOUT (90 s), CHROME.
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
  if [ "$PROFILE" = full ]; then
    echo "page layout guard FAILED: Chrome not found ($CHROME); set CHROME=/path/to/chrome"
    exit 1
  fi
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
LOCK="$BUILD/page-layout.lock"
mkdir -p "$BUILD"

SERVER_PID=""
STARTED=""
GUARD_PID=""
LOCKED=""

# One run per worktree: a lock directory in the build dir, holding the pid of its run. A lock whose pid is gone is stale.
release_lock() {
  if [ -n "$LOCKED" ]; then
    rm -rf "$LOCK"
    LOCKED=""
  fi
}
acquire_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    echo $$ >"$LOCK/pid"
    LOCKED=1
    return 0
  fi
  local other
  other="$(cat "$LOCK/pid" 2>/dev/null || true)"
  if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
    return 1
  fi
  rm -rf "$LOCK"
  if mkdir "$LOCK" 2>/dev/null; then
    echo $$ >"$LOCK/pid"
    LOCKED=1
    return 0
  fi
  return 1
}

# A refused run: another run holds the worktree's lock, or the port is taken. It fails in every mode.
refused() {
  release_lock
  echo "page layout guard FAILED: $1"
  exit 1
}

# A guard that did not run: a WARN (exit 0) in quick, a FAILED run (exit 1) in full.
not_run() {
  release_lock
  if [ "$PROFILE" = full ]; then
    echo "page layout guard FAILED: $1"
    exit 1
  fi
  echo "WARN: $1"
  exit 0
}

# Stops only the server THIS run started (STARTED is set after its spawn) and the guard this run started. Never another run's server.
stop_server() {
  if [ -n "${GUARD_PID:-}" ] && kill -0 "$GUARD_PID" 2>/dev/null; then
    kill -TERM "$GUARD_PID" 2>/dev/null
    pkill -TERM -P "$GUARD_PID" 2>/dev/null
  fi
  if [ "$STARTED" = 1 ]; then
    local pid="${SERVER_PID:-}"
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
    rm -f "$PIDFILE"
  fi
  SERVER_PID=""
  STARTED=""
}
cleanup() {
  stop_server
  release_lock
}

# The lock and the busy-port check come before the trap: a run that is refused must not stop anything it does not own.
if ! acquire_lock; then
  refused "another page layout guard is running in this worktree (lock $LOCK); not run"
fi
# Never touch a server that is not ours.
if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then
  refused "something already listens on $URL; page layout guard not run (set PAGE_LAYOUT_PORT to another port)"
fi
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

if [ -z "${PAGE_LAYOUT_SERVER_CMD:-}" ]; then
  if ! (cd "$ROOT" && go build -buildvcs=false -o "$BUILD/feeder" ./cmd/feeder) >"$BUILD/page-layout-build.log" 2>&1; then
    not_run "go build failed, page layout guard not run (see $BUILD/page-layout-build.log)"
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
STARTED=1

ready=""
for _ in $(seq 1 150); do
  if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then ready=1; break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || break
  sleep 0.2
done
if [ -z "$ready" ]; then
  not_run "the page layout server did not start on $URL (see $LOG); guard not run"
fi
[ -s "$PIDFILE" ] && SERVER_PID="$(cat "$PIDFILE")"

SEED_CMD="${PAGE_LAYOUT_SEED_CMD:-node $ROOT/scripts/test/fixtures/page-layout-seed.mjs}"
# Same kind of limit as the guard: a hung seeder must not hang check.sh. -k: kill whatever ignores TERM.
SEED_LIMIT=""
command -v timeout >/dev/null 2>&1 && SEED_LIMIT="timeout -k 5 ${PAGE_LAYOUT_SEED_TIMEOUT:-90}"
(cd "$ROOT" && exec $SEED_LIMIT bash -c "$SEED_CMD \"\$@\"" _ "$URL" --out "$IDS") >"$BUILD/page-layout-seed.log" 2>&1
SEED_RC=$?
if [ "$SEED_RC" -ne 0 ]; then
  if [ "$SEED_RC" -eq 124 ] || [ "$SEED_RC" -eq 137 ]; then
    not_run "seeding timed out after ${PAGE_LAYOUT_SEED_TIMEOUT:-90}s, page layout guard not run (see $BUILD/page-layout-seed.log)"
  fi
  not_run "seeding failed, page layout guard not run (see $BUILD/page-layout-seed.log)"
fi

GUARD_CMD="${PAGE_LAYOUT_GUARD_CMD:-node $ROOT/scripts/check-page-layout.mjs}"
LIMIT=""
# About 45 s is normal (quick profile); 300 s means something hangs. -k: kill what ignores TERM.
command -v timeout >/dev/null 2>&1 && LIMIT="timeout -k 5 ${PAGE_LAYOUT_GUARD_TIMEOUT:-300}"
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
if [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  cat "$OUT"
  not_run "the page layout guard timed out after ${PAGE_LAYOUT_GUARD_TIMEOUT:-300}s (${ELAPSED}s elapsed); not a layout finding"
fi
if [ "$RC" -ne 1 ]; then
  cat "$OUT"
  not_run "the page layout guard could not run (exit $RC, ${ELAPSED}s); not a layout finding"
fi

N="$(grep -cE '^[[:space:]]+- [0-9]+px ' "$OUT")"
BYRULE="$(grep -oE '^[[:space:]]+- [0-9]+px [^:]+: P[0-9]+' "$OUT" | grep -oE 'P[0-9]+$' | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
FAILN="$(node "$ROOT/scripts/lib/page-layout-modes.mjs" count-fail "$MODES" <"$OUT" 2>/dev/null || echo 0)"
NI="$(grep -cE '^  ! [0-9]+px .*not inspected' "$OUT")"
cat "$OUT"
if [ "${NI:-0}" -gt 0 ]; then
  echo "page layout guard FAILED: $NI route(s) not inspected (the ! lines above; a route that cannot be probed needs a reason in scripts/check-page-layout.exempt), ${ELAPSED}s"
fi
if [ "${FAILN:-0}" -gt 0 ]; then
  echo "page layout guard FAILED: $FAILN finding(s) on routes in fail mode (scripts/check-page-layout.modes); $N in total ($BYRULE), ${ELAPSED}s"
fi
if [ "${NI:-0}" -gt 0 ] || [ "${FAILN:-0}" -gt 0 ]; then
  exit 1
fi
echo "WARN: $N page-layout findings (warn mode) [$BYRULE] ($PROFILE profile, ${ELAPSED}s); flip routes in scripts/check-page-layout.modes as they are migrated"
exit 0
