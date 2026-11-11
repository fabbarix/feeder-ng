#!/usr/bin/env bash
# R2-L: scripts/check-page-layout.sh builds, starts a DETACHED server on a worktree-unique port with a scratch data dir, seeds,
# runs the guard, stops the server (always), and maps findings to warn/fail per route. Everything heavy is replaced by fakes here.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
W="$ROOT/scripts/check-page-layout.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

[ -f "$W" ] && ok || bad "scripts/check-page-layout.sh is missing"
[ -x "$W" ] && ok || bad "scripts/check-page-layout.sh must be executable"
bash -n "$W" 2>/dev/null && ok || bad "scripts/check-page-layout.sh must parse"

# --- static rules
if [ -f "$W" ]; then
  grep -q 'setsid' "$W" && ok || bad "the server must start detached (setsid)"
  grep -Eq "trap .*(EXIT|INT)" "$W" && ok || bad "a trap must stop the server on every exit path"
  grep -q 'cksum' "$W" && ok || bad "the port must derive from the worktree path (cksum)"
  grep -Eq '127\.0\.0\.1' "$W" && ok || bad "the server must bind 127.0.0.1 only"
  grep -Eq '(:|=)(8080|5173|5199|18477)\b' "$W" && bad "no fixed port numbers (other worktrees run servers in parallel)" || ok
  grep -q 'FEEDER_DEV_LOGIN' "$W" && grep -q 'FEEDER_DATA_DIR' "$W" && ok || bad "dev login and a scratch FEEDER_DATA_DIR are required"
fi

# --- check.sh wiring: after vite build (the binary embeds web/dist), before go vet, in its own step
CH="$ROOT/scripts/check.sh"
grep -q 'check-page-layout.sh' "$CH" && ok || bad "check.sh must run scripts/check-page-layout.sh"
l_build=$(grep -n 'step "vite build"' "$CH" | cut -d: -f1); l_pl=$(grep -n 'check-page-layout.sh' "$CH" | head -1 | cut -d: -f1); l_vet=$(grep -n 'step "go vet"' "$CH" | cut -d: -f1)
[ -n "$l_pl" ] && [ "$l_build" -lt "$l_pl" ] && [ "$l_pl" -lt "$l_vet" ] && ok || bad "the page layout step must sit between vite build and go vet"

# --- modes file and the guard files
M="$ROOT/scripts/check-page-layout.modes"
grep -Eq '^default=warn$' "$M" 2>/dev/null && ok || bad "check-page-layout.modes must start in warn mode (default=warn)"
[ -f "$ROOT/scripts/check-page-layout.mjs" ] && ok || bad "scripts/check-page-layout.mjs (the CDP driver) is missing"
node --check "$ROOT/scripts/check-page-layout.mjs" 2>/dev/null && ok || bad "check-page-layout.mjs must parse"
grep -q 'lib/page-layout-rules.mjs' "$ROOT/scripts/check-page-layout.mjs" 2>/dev/null && ok || bad "the driver must import the pure rules module"
grep -Eq -- "--url" "$ROOT/scripts/check-page-layout.mjs" 2>/dev/null && ok || bad "the driver must require --url (no default port)"
grep -Eq -- "--profile" "$ROOT/scripts/check-page-layout.mjs" 2>/dev/null && ok || bad "the driver must take --profile quick|full"
[ -f "$ROOT/scripts/test/fixtures/page-layout-seed.mjs" ] && ok || bad "scripts/test/fixtures/page-layout-seed.mjs (the review seeder) is missing"
grep -q '/api/dev/login' "$ROOT/scripts/test/fixtures/page-layout-seed.mjs" 2>/dev/null && ok || bad "the seeder must sign in through /api/dev/login"
grep -q 'page-layout-ids' "$ROOT/scripts/test/fixtures/page-layout-seed.mjs" 2>/dev/null && ok || bad "the seeder must write the ids file (build/page-layout-ids.json)"

[ -x "$W" ] || { printf 'check-page-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"; exit 1; }

# --- --print-port: deterministic, in 20000..39999, differs per worktree path
p1=$("$W" --print-port --root /a/worktree-one 2>/dev/null); p1b=$("$W" --print-port --root /a/worktree-one 2>/dev/null); p2=$("$W" --print-port --root /a/worktree-two 2>/dev/null)
[[ "$p1" =~ ^[0-9]+$ ]] && [ "$p1" -ge 20000 ] && [ "$p1" -le 39999 ] && ok || bad "--print-port must print a port in 20000..39999 (got '$p1')"
[ "$p1" = "$p1b" ] && ok || bad "--print-port must be deterministic"
[ -n "$p1" ] && [ "$p1" != "$p2" ] && ok || bad "different worktree paths must give different ports"

# --- --mode-of
printf 'default=warn\nfail_routes=/plan /settings/*\n' >"$TMP/modes"
[ "$(PAGE_LAYOUT_MODES="$TMP/modes" "$W" --mode-of /plan 2>/dev/null)" = fail ] && ok || bad "--mode-of /plan must print fail"
[ "$(PAGE_LAYOUT_MODES="$TMP/modes" "$W" --mode-of /settings/members 2>/dev/null)" = fail ] && ok || bad "--mode-of /settings/members must print fail"
[ "$(PAGE_LAYOUT_MODES="$TMP/modes" "$W" --mode-of /shop 2>/dev/null)" = warn ] && ok || bad "--mode-of /shop must print warn"

# --- skip and missing Chrome never fail and never start anything
out=$(PAGE_LAYOUT=skip "$W" 2>&1); rc=$?
[ "$rc" -eq 0 ] && grep -qi 'skipped' <<<"$out" && ok || bad "PAGE_LAYOUT=skip must print 'skipped' and exit 0"
rm -f "$TMP/started"
out=$(CHROME=/nonexistent/chrome PAGE_LAYOUT_BUILD_DIR="$TMP/b0" PAGE_LAYOUT_SERVER_CMD="touch $TMP/started" "$W" 2>&1); rc=$?
[ "$rc" -eq 0 ] && grep -q 'SKIP' <<<"$out" && [ ! -e "$TMP/started" ] && ok || bad "missing Chrome must print SKIP, exit 0 and start no server"

# --- a full run with fakes
cat >"$TMP/fake-server.sh" <<'FS'
printenv PORT FEEDER_ADDR FEEDER_DATA_DIR FEEDER_DEV_LOGIN FEEDER_ADMIN_EMAIL >"$FAKE_ENV_OUT"
echo $$ >"$FAKE_PID_OUT"
exec node -e 'require("http").createServer((q,s)=>s.end("ok")).listen(process.env.PORT,"127.0.0.1")'
FS
cat >"$TMP/fake-seed.sh" <<'FS'
echo "$@" >"$FAKE_SEED_OUT"
FS
cat >"$TMP/fake-guard.sh" <<'FS'
echo "$@" >"$FAKE_GUARD_OUT"
if [ -n "${FAKE_FINDING:-}" ]; then
  echo "check-page-layout: 1 failure(s)"
  echo "  - 1440px ${FAKE_FINDING}: P3 content is 1036px wide"
  exit 1
fi
exit 0
FS
free_port() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }

run_full() { # FINDING_ROUTE MODES_TEXT -> RC, OUT, PORT
  local d; d="$(mktemp -d "$TMP/run.XXXX")"; PORT="$(free_port)"
  printf '%b' "$2" >"$d/modes"
  OUT=$(CHROME=/bin/true PAGE_LAYOUT_BUILD_DIR="$d" PAGE_LAYOUT_PORT="$PORT" PAGE_LAYOUT_MODES="$d/modes" \
    PAGE_LAYOUT_SERVER_CMD="bash $TMP/fake-server.sh" PAGE_LAYOUT_SEED_CMD="bash $TMP/fake-seed.sh" PAGE_LAYOUT_GUARD_CMD="bash $TMP/fake-guard.sh" \
    FAKE_ENV_OUT="$d/env" FAKE_PID_OUT="$d/pid" FAKE_SEED_OUT="$d/seed" FAKE_GUARD_OUT="$d/guard" FAKE_FINDING="$1" "$W" 2>&1)
  RC=$?; RUN="$d"
}
server_gone() { ! curl -s --max-time 1 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && { [ ! -s "$RUN/pid" ] || ! kill -0 "$(cat "$RUN/pid")" 2>/dev/null; }; }

run_full "" 'default=warn\n'
[ "$RC" -eq 0 ] && ok || bad "a clean run must exit 0 (rc $RC)"
server_gone && ok || bad "the server must be stopped after a clean run"
envs=$(cat "$RUN/env" 2>/dev/null)
grep -qx "127.0.0.1:$PORT" <<<"$envs" && ok || bad "FEEDER_ADDR must be 127.0.0.1:<port>"
grep -q "page-layout" <<<"$(sed -n 3p "$RUN/env" 2>/dev/null)" && ok || bad "FEEDER_DATA_DIR must be a scratch dir named page-layout under the build dir"
grep -qx 1 <<<"$envs" && ok || bad "FEEDER_DEV_LOGIN=1 must be set"
grep -q -- "--url http://127.0.0.1:$PORT" "$RUN/guard" 2>/dev/null && ok || bad "the guard must get --url http://127.0.0.1:<port>"
grep -q -- "--profile quick" "$RUN/guard" 2>/dev/null && ok || bad "the guard must default to --profile quick"
grep -q "http://127.0.0.1:$PORT" "$RUN/seed" 2>/dev/null && ok || bad "the seeder must get the server URL"

run_full "/plan" 'default=warn\n'
[ "$RC" -eq 0 ] && grep -q 'WARN' <<<"$OUT" && grep -q 'P3' <<<"$OUT" && ok || bad "warn mode: findings are printed with WARN and the run exits 0 (rc $RC)"
server_gone && ok || bad "the server must be stopped after a guard finding"

run_full "/plan" 'default=warn\nfail_routes=/plan\n'
[ "$RC" -ne 0 ] && ok || bad "a finding on a fail route must exit non-zero"
server_gone && ok || bad "the server must be stopped after a failing run"

run_full "/plan" 'default=warn\nfail_routes=/shop\n'
[ "$RC" -eq 0 ] && ok || bad "a finding on a warn route must not fail when another route is fail (rc $RC)"

PAGE_LAYOUT=full run_full "" 'default=warn\n'
grep -q -- "--profile full" "$RUN/guard" 2>/dev/null && ok || bad "PAGE_LAYOUT=full must pass --profile full"

# a crashing seeder still stops the server and still only warns
echo 'exit 3' >"$TMP/fake-seed.sh"
run_full "" 'default=warn\n'
server_gone && ok || bad "the server must be stopped when the seeder fails"

printf 'check-page-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
