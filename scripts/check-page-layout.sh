#!/usr/bin/env bash
# R2-L page-layout guard wrapper (design: docs/dev/design/r2l-page-layout.md section 5; coverage: docs/dev/design/b5-pl.md).
# Builds the server, starts it DETACHED on a worktree-unique port with a scratch data dir, seeds it, runs the CDP guard
# (scripts/check-page-layout.mjs), stops the server it started on EVERY exit path, and maps findings to warn/fail per route
# (scripts/check-page-layout.modes).
# Coverage: a route x viewport that was not inspected FAILS in every mode. Rule findings are warn/fail by the modes file.
# A guard that did not run FAILS in every mode (quick too): a refused run (a busy port, or a run already holding this
# worktree's lock), a server or seed that did not come up, a timeout, a crash, or a driver exit 2. Only two environment gaps
# pass in quick: no Chrome (SKIP) and no web build (WARN). Both FAIL in full (PAGE_LAYOUT=full, release QA).
#   scripts/check-page-layout.sh                 quick profile (390, 834, 1024, 1440, 1920)
#   PAGE_LAYOUT=full scripts/check-page-layout.sh    six viewports (release QA)
#   PAGE_LAYOUT=skip ...                          do nothing
#   scripts/check-page-layout.sh --print-port [--root DIR]    the port this worktree uses (20000 + cksum(DIR) % 20000)
#   scripts/check-page-layout.sh --mode-of ROUTE              warn|fail for a route
# Overrides (tests): PAGE_LAYOUT_BUILD_DIR, PAGE_LAYOUT_PORT, PAGE_LAYOUT_MODES, PAGE_LAYOUT_SERVER_CMD, PAGE_LAYOUT_SEED_CMD,
# PAGE_LAYOUT_GUARD_CMD, PAGE_LAYOUT_GUARD_TIMEOUT (600 s), PAGE_LAYOUT_SEED_TIMEOUT (90 s), CHROME, PAGE_LAYOUT_FAKE_CMD.
# beta.7 (RR5): the real run also starts the fake Anthropic API (cmd/fakeanthropic, loopback, detached, stopped by its PID) and
# gives the server a throwaway FEEDER_SECRET_KEY, so the seeder can turn the Recipe Assistant on against it and a receipt read
# completes (the guard's populated receipt review). A run with PAGE_LAYOUT_SERVER_CMD starts no fake unless PAGE_LAYOUT_FAKE_CMD
# is set (a command that serves on $PORT).
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
FAKE_PID=""
FAKE_URL=""
FAKE_PIDFILE="$BUILD/page-layout-fake.pid"
FAKE_LOG="$BUILD/page-layout-fake.log"

# A refused run: another run holds this worktree's lock, or the port is taken. It FAILS in every mode.
refused() {
  echo "page layout guard FAILED: $1"
  exit 1
}

# A guard that did not run (coverage lost) FAILS in every mode, quick included.
not_run() {
  echo "page layout guard FAILED: $1"
  exit 1
}

# The web build is missing: the server answers 503 "frontend not built". A WARN (exit 0) in quick, a FAILED run in full.
no_web_build() {
  if [ "$PROFILE" = full ]; then
    echo "page layout guard FAILED: no web build (the server answers 503 'frontend not built'); run pnpm -C web build and rebuild the server"
    exit 1
  fi
  echo "WARN: no web build (the server answers 503 'frontend not built'); page layout guard not run (run pnpm -C web build)"
  exit 0
}

# Stops the fake Anthropic API THIS run started (its own session, by its exact PID), never another run's.
stop_fake() {
  local pid="${FAKE_PID:-}"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    local i
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null; }
  fi
  [ -n "$pid" ] && rm -f "$FAKE_PIDFILE"
  FAKE_PID=""
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
  stop_fake
}

# One run per worktree: flock -n on $BUILD/page-layout.lock, held on fd 9 for this script's whole life. The kernel drops the lock
# when the holder dies, so there is no stale-lock handling and a leftover lock file is harmless. Every process this run starts
# closes fd 9 (`9>&-`), so no server, seeder, guard or Chrome can keep the lock after this run has gone.
acquire_lock() {
  exec 9>"$LOCK" && flock -n 9
}

# The lock and the busy-port check come before the trap: a refused run must not stop anything it does not own.
if ! acquire_lock; then
  refused "another page layout guard is running in this worktree (lock $LOCK is held); not run"
fi
# Never touch a server that is not ours.
if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then
  refused "port $PORT is taken: something already listens on $URL, so page layout guard not run (the pid of a server this worktree started is in $PIDFILE; set PAGE_LAYOUT_PORT to another port)"
fi
trap stop_server EXIT
trap 'exit 130' INT TERM HUP

if [ -z "${PAGE_LAYOUT_SERVER_CMD:-}" ]; then
  if ! (cd "$ROOT" && go build -buildvcs=false -o "$BUILD/feeder" ./cmd/feeder) 9>&- >"$BUILD/page-layout-build.log" 2>&1; then
    not_run "go build failed, page layout guard not run (see $BUILD/page-layout-build.log)"
  fi
  SERVER_CMD="$BUILD/feeder"
  if [ -z "${PAGE_LAYOUT_FAKE_CMD:-}" ]; then
    if ! (cd "$ROOT" && go build -buildvcs=false -o "$BUILD/fakeanthropic" ./cmd/fakeanthropic) 9>&- >>"$BUILD/page-layout-build.log" 2>&1; then
      not_run "go build of cmd/fakeanthropic failed, page layout guard not run (see $BUILD/page-layout-build.log)"
    fi
    FAKE_CMD="$BUILD/fakeanthropic -addr 127.0.0.1:\$PORT"
  fi
else
  SERVER_CMD="$PAGE_LAYOUT_SERVER_CMD"
fi
[ -n "${PAGE_LAYOUT_FAKE_CMD:-}" ] && FAKE_CMD="$PAGE_LAYOUT_FAKE_CMD"

# The fake Anthropic API (beta.7, RR5): a port of its own range (40000..59999, from the worktree path), the next free one of five.
if [ -n "${FAKE_CMD:-}" ]; then
  fport=$((40000 + $(printf '%s' "$ROOT" | cksum | cut -d' ' -f1) % 20000))
  for _ in 1 2 3 4 5; do
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$fport/" 2>/dev/null || break
    fport=$((fport + 1))
  done
  : >"$FAKE_LOG"
  rm -f "$FAKE_PIDFILE"
  PORT="$fport" setsid nohup bash -c 'echo $$ >"$1"; shift; eval "exec $1"' _ "$FAKE_PIDFILE" "$FAKE_CMD" >>"$FAKE_LOG" 2>&1 </dev/null 9>&- &
  FAKE_PID=$!
  for _ in $(seq 1 50); do
    if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$fport/v1/models" 2>/dev/null; then FAKE_URL="http://127.0.0.1:$fport"; break; fi
    kill -0 "$FAKE_PID" 2>/dev/null || break
    sleep 0.2
  done
  [ -s "$FAKE_PIDFILE" ] && FAKE_PID="$(cat "$FAKE_PIDFILE")"
  [ -n "$FAKE_URL" ] || not_run "the fake Anthropic API did not start on port $fport (see $FAKE_LOG); guard not run"
fi
# A throwaway key, so the Recipe Assistant can keep the fake's API key (FEEDER_SECRET_KEY: base64 of 32 bytes).
SECRET_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"

rm -rf "$DATA" "$IDS"
mkdir -p "$DATA"
: >"$LOG"
rm -f "$PIDFILE"

# Detached (own session and process group), loopback only, scratch data dir, dev login.
FEEDER_SECRET_KEY="$SECRET_KEY" FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR="$DATA" FEEDER_ADDR="127.0.0.1:$PORT" PORT="$PORT" \
  setsid nohup bash -c 'echo $$ >"$1"; shift; exec '"$SERVER_CMD" _ "$PIDFILE" >>"$LOG" 2>&1 </dev/null 9>&- &
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

# No web build: without web/dist the server answers 503 "frontend not built" on every page. There is no app to guard, so neither the seeder nor the guard runs.
ROOT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$URL/" 2>/dev/null || true)"
ROOT_BODY="$(curl -s --max-time 2 "$URL/" 2>/dev/null || true)"
if [ "$ROOT_CODE" = 503 ] && grep -qi 'frontend not built' <<<"$ROOT_BODY"; then
  no_web_build
fi

SEED_CMD="${PAGE_LAYOUT_SEED_CMD:-node $ROOT/scripts/test/fixtures/page-layout-seed.mjs}"
# Same kind of limit as the guard: a hung seeder must not hang check.sh. -k: kill whatever ignores TERM.
SEED_LIMIT=""
command -v timeout >/dev/null 2>&1 && SEED_LIMIT="timeout -k 5 ${PAGE_LAYOUT_SEED_TIMEOUT:-90}"
(cd "$ROOT" && PAGE_LAYOUT_FAKE_ANTHROPIC_URL="$FAKE_URL" exec $SEED_LIMIT bash -c "$SEED_CMD \"\$@\"" _ "$URL" --out "$IDS") 9>&- >"$BUILD/page-layout-seed.log" 2>&1
SEED_RC=$?
if [ "$SEED_RC" -ne 0 ]; then
  if [ "$SEED_RC" -eq 124 ] || [ "$SEED_RC" -eq 137 ]; then
    not_run "seeding timed out after ${PAGE_LAYOUT_SEED_TIMEOUT:-90}s, page layout guard not run (see $BUILD/page-layout-seed.log)"
  fi
  not_run "seeding failed, page layout guard not run (see $BUILD/page-layout-seed.log)"
fi

GUARD_CMD="${PAGE_LAYOUT_GUARD_CMD:-node $ROOT/scripts/check-page-layout.mjs}"
LIMIT=""
# About 200 s is normal for the quick profile and 250 s for the full one (five or six viewports, the filtered scenarios, two walks;
# pantry-filter review: 300 s left the full run under 20 % headroom). beta.7 added the Supplies, Scan and receipt scenarios, each a
# setup replayed for its dark pass: about 345 s quick and 385 s full on the reference machine. 600 s means something hangs.
# -k: kill what ignores TERM.
command -v timeout >/dev/null 2>&1 && LIMIT="timeout -k 5 ${PAGE_LAYOUT_GUARD_TIMEOUT:-600}"
START=$SECONDS
# In the background and waited for, so a signal reaches the trap at once (bash defers traps while a foreground command runs).
(cd "$ROOT" && exec $LIMIT bash -c "$GUARD_CMD \"\$@\"" _ --url "$URL" --profile "$PROFILE" --ids "$IDS") 9>&- >"$OUT" 2>&1 &
GUARD_PID=$!
wait "$GUARD_PID"
RC=$?
GUARD_PID=""
ELAPSED=$((SECONDS - START))
# The probe count from the driver's coverage summary ("check-page-layout: coverage: inspected N of M (...)").
PROBES="$(sed -n 's/^.*check-page-layout: coverage: inspected \([0-9][0-9]*\) of .*/\1/p' "$OUT" | tail -n1)"

if [ "$RC" -eq 0 ]; then
  cat "$OUT"
  if [ -n "$PROBES" ]; then
    echo "page layout guard: OK ($PROFILE profile, $PROBES probes, ${ELAPSED}s)"
  else
    echo "page layout guard: OK ($PROFILE profile, ${ELAPSED}s)"
  fi
  exit 0
fi
if [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  cat "$OUT"
  not_run "the page layout guard timed out after ${PAGE_LAYOUT_GUARD_TIMEOUT:-600}s (${ELAPSED}s elapsed); not a layout finding"
fi
if [ "$RC" -ne 1 ]; then
  cat "$OUT"
  not_run "the page layout guard could not run (exit $RC, ${ELAPSED}s); not a layout finding"
fi
# Exit 1 is a run with findings or lost coverage. Exit 1 with neither a finding nor a coverage line is a crash, and it FAILS.
N="$(grep -cE '^[[:space:]]+- [0-9]+px ' "$OUT")"
if [ "$N" -eq 0 ] && ! grep -q 'check-page-layout: coverage:' "$OUT"; then
  cat "$OUT"
  not_run "the page layout guard crashed (exit 1 with no coverage line, ${ELAPSED}s); not a layout finding"
fi

BYRULE="$(grep -oE '^[[:space:]]+- [0-9]+px [^:]+: P[0-9]+' "$OUT" | grep -oE 'P[0-9]+$' | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
NI="$(grep -cE '^  ! [0-9]+px .*not inspected' "$OUT")"
cat "$OUT"
# The fail count is only meaningful if the modes file can be read: an unknown count must never pass as 0.
if [ ! -r "$MODES" ]; then
  echo "page layout guard FAILED: the modes file $MODES cannot be read, so the fail count is unknown ($N finding(s), ${ELAPSED}s)"
  exit 1
fi
if ! FAILN="$(node "$ROOT/scripts/lib/page-layout-modes.mjs" count-fail "$MODES" <"$OUT")"; then
  echo "page layout guard FAILED: the modes file $MODES could not be read, so the fail count is unknown (${ELAPSED}s)"
  exit 1
fi
if [ "$NI" -gt 0 ]; then
  echo "page layout guard FAILED: $NI route(s) not inspected (the ! lines above; a route that cannot be probed needs a reason in scripts/check-page-layout.exempt), ${ELAPSED}s"
fi
if [ "$FAILN" -gt 0 ]; then
  echo "page layout guard FAILED: $FAILN finding(s) on routes in fail mode (scripts/check-page-layout.modes); $N in total ($BYRULE), ${ELAPSED}s"
fi
if [ "$NI" -gt 0 ] || [ "$FAILN" -gt 0 ]; then
  exit 1
fi
echo "WARN: $N page-layout findings (warn mode) [$BYRULE] ($PROFILE profile, ${ELAPSED}s); flip routes in scripts/check-page-layout.modes as they are migrated"
exit 0
