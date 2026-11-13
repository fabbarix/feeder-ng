#!/usr/bin/env bash
# check-profile: browser (starts Chrome; CHECK_PROFILE=ci leaves it out, the full check runs it)
# b5-pl: the page-layout guard must never lose coverage silently. A route x viewport that could not be probed is "not inspected" and FAILS
# the guard (exit 1, whatever the modes file says), unless the route is listed in scripts/check-page-layout.exempt with a reason.
# Design: docs/dev/design/b5-pl.md. Written first (red); the fix lands in a following commit.
set -uo pipefail

for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
W="$ROOT/scripts/check-page-layout.sh"
DRV="$ROOT/scripts/check-page-layout.mjs"
COV="$ROOT/scripts/lib/page-layout-coverage.mjs"
EXEMPT="$ROOT/scripts/check-page-layout.exempt"
TMP="$(mktemp -d)"
trap 'jobs -p | xargs -r kill 2>/dev/null; rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
free_port() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }

# --- the pure coverage module (scripts/lib/page-layout-coverage.mjs)
[ -f "$COV" ] && ok || bad "scripts/lib/page-layout-coverage.mjs is missing"
js() { node --input-type=module -e "import * as c from '$COV'; import { ROUTES } from '$ROOT/scripts/lib/page-layout-rules.mjs'; $1" 2>&1; }

# parseExemptions: '<route pattern> <reason>' per line, '#' comments and blank lines ignored; the pattern must be a ROUTES pattern, the reason non-empty
out=$(js "console.log(JSON.stringify(c.parseExemptions('# c\n\n/scan camera needs a device\n/settings/tags  no data in the seed\n')))")
[ "$out" = '[{"pattern":"/scan","reason":"camera needs a device"},{"pattern":"/settings/tags","reason":"no data in the seed"}]' ] && ok || bad "parseExemptions must return [{pattern, reason}] (got: $out)"
out=$(js "try { c.parseExemptions('/scan\n'); console.log('no error') } catch (e) { console.log('error: ' + e.message) }")
grep -q '^error:.*reason' <<<"$out" && ok || bad "an exemption without a reason must be rejected, naming the missing reason (got: $out)"
out=$(js "try { c.parseExemptions('/nope some reason\n'); console.log('no error') } catch (e) { console.log('error: ' + e.message) }")
grep -q '^error:.*/nope' <<<"$out" && ok || bad "an exemption for a pattern that is not in ROUTES must be rejected, naming it (got: $out)"

# coverageSummary: counts, and which not-inspected entries fail
SUM="const r = c.coverageSummary({ inspected: 88, notInspected: [
  { width: 390, route: '/recipes/1', pattern: '/recipes/:id', reason: 'no <main> element' },
  { width: 1440, route: '/scan', pattern: '/scan', reason: 'no <main> element' } ], exemptions: c.parseExemptions('/scan camera needs a device\n') });"
out=$(js "$SUM console.log(JSON.stringify({ ok: r.ok, failing: r.failing.map((f) => f.route), exempt: r.exempt.map((f) => f.route), total: r.total }))")
[ "$out" = '{"ok":false,"failing":["/recipes/1"],"exempt":["/scan"],"total":90}' ] && ok || bad "coverageSummary: a non-exempt entry fails, an exempt one is reported but passes (got: $out)"
out=$(js "$SUM console.log(r.line)")
[ "$out" = 'check-page-layout: coverage: inspected 88 of 90 (not inspected 2: 1 exempt, 1 failing)' ] && ok || bad "the summary line must read 'coverage: inspected N of M (not inspected K: E exempt, F failing)' (got: $out)"
out=$(js "console.log(c.coverageSummary({ inspected: 93, notInspected: [], exemptions: [] }).ok)")
[ "$out" = true ] && ok || bad "nothing not inspected must be ok (got: $out)"
out=$(js "console.log(c.notInspectedLine({ width: 390, route: '/recipes/1', reason: 'no <main> element' }))")
[ "$out" = '  ! 390px /recipes/1: not inspected (no <main> element)' ] && ok || bad "notInspectedLine format (got: $out)"

# the shipped exemption list: every entry valid, and each has a reason (the file is the only way to exempt a route)
[ -f "$EXEMPT" ] && ok || bad "scripts/check-page-layout.exempt is missing (it may hold only comments, but it must exist)"
out=$(js "import('node:fs').then((fs) => { try { console.log('entries ' + c.parseExemptions(fs.readFileSync('$EXEMPT', 'utf8')).length) } catch (e) { console.log('error: ' + e.message) } })")
[ "$out" = 'entries 0' ] && ok || bad "the shipped exemption list must parse (got: $out)"
grep -q 'getBoundingClientRect\|server' "$EXEMPT" 2>/dev/null && bad "the exemption list must not exempt a route to hide a dead server or a probe crash"  || ok

# --- the driver against a server that does not render the app (the failure seen in the full check: a dead or half-built server, no <main>)
REAL="$(command -v google-chrome || command -v chromium || true)"
if [ -n "$REAL" ]; then
  PORT="$(free_port)"
  cat >"$TMP/nomain.js" <<'JS'
require('http').createServer((q, s) => {
  if (q.method === 'POST' && q.url === '/api/dev/login') { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.statusCode = 503; s.end('frontend not built')
}).listen(process.env.PORT, '127.0.0.1')
JS
  PORT="$PORT" setsid nohup node "$TMP/nomain.js" >/dev/null 2>&1 &
  for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
  mkdir -p "$TMP/b"
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/settings$' timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT" --ids "$TMP/b/ids.json" 2>&1); RC=$?
  [ "$RC" -eq 1 ] && ok || bad "a route that cannot be probed must make the driver exit 1 (rc $RC): $DOUT"
  grep -q '! 390px /settings: not inspected' <<<"$DOUT" && ok || bad "the not-inspected route must be listed as '! 390px /settings: not inspected (...)' (got: $DOUT)"
  grep -q 'no <main>' <<<"$DOUT" && ok || bad "the reason must say the page has no <main> element, not a raw getBoundingClientRect TypeError (got: $DOUT)"
  grep -q 'getBoundingClientRect' <<<"$DOUT" && bad "the raw TypeError must not reach the output" || ok
  # DS-A: the quick profile has 5 viewports (390, 834, 1024, 1440, 1920)
  grep -q 'coverage: inspected 0 of 5 (not inspected 5: 0 exempt, 5 failing)' <<<"$DOUT" && ok || bad "the summary must count inspected and not inspected routes (got: $DOUT)"
  grep -q 'check-page-layout: OK' <<<"$DOUT" && bad "the guard must not print OK when routes were not inspected" || ok
  # an explicit exemption turns that route's lines into 'exempt' and the run passes
  printf '/settings test fixture: this server renders no app\n' >"$TMP/b/exempt"
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/settings$' timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT" --ids "$TMP/b/ids.json" --exempt "$TMP/b/exempt" 2>&1); RC=$?
  [ "$RC" -eq 0 ] && grep -q '5 exempt, 0 failing' <<<"$DOUT" && ok || bad "an exempt route that cannot be probed passes and is counted as exempt (rc $RC): $DOUT"
  # a server that dies while the guard runs is the same thing: not inspected, never OK
  pkill -f "$TMP/nomain.js" 2>/dev/null
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/settings$' PAGE_LAYOUT_CDP_TIMEOUT_MS=3000 timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT" --ids "$TMP/b/ids.json" 2>&1); RC=$?
  [ "$RC" -ne 0 ] && ok || bad "a dead server must never end in OK (rc $RC): $DOUT"
  # a PAGE_LAYOUT_ONLY filter that matches no route inspected nothing: it fails, it is never "inspected 0 of 0" / OK
  PORT2="$(free_port)"
  PORT="$PORT2" setsid nohup node "$TMP/nomain.js" >/dev/null 2>&1 &
  for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT2/" && break; sleep 0.2; done
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/no-such-route$' timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT2" --ids "$TMP/b/ids.json" 2>&1); RC=$?
  { [ "$RC" -ne 0 ] && ! grep -q 'check-page-layout: OK' <<<"$DOUT" && ! grep -q 'inspected 0 of 0' <<<"$DOUT"; } && ok || bad "a PAGE_LAYOUT_ONLY filter matching no route must fail, not pass as 'inspected 0 of 0' (rc $RC): $DOUT"
  pkill -f "$TMP/nomain.js" 2>/dev/null
fi
# the driver's OK line reports the probes it ran, not viewports x all routes (PAGE_LAYOUT_ONLY narrows the run)
okline=$(grep -n 'check-page-layout: OK' "$DRV")
grep -q 'ROUTES.length' <<<"$okline" && bad "the driver's OK line must report the real probe count (the 'probes' counter), not VIEWPORTS x ROUTES.length: $okline" || ok
grep -q 'probes' <<<"$okline" && ok || bad "the driver's OK line must report the real probe count (got: $okline)"

# --- the wrapper: not-inspected lines fail the run in any mode (warn included); an exempt-only run passes
cat >"$TMP/fake-server.sh" <<'FS'
echo $$ >"$FAKE_PID_OUT"
exec node -e 'require("http").createServer((q,s)=>{ if (process.env.FAKE_NO_FRONTEND) { s.statusCode = 503; return s.end("frontend not built") } s.end("ok") }).listen(process.env.PORT,"127.0.0.1")'
FS
echo 'true' >"$TMP/fake-seed.sh"
cat >"$TMP/fake-guard.sh" <<'FS'
[ -n "${FAKE_SLEEP:-}" ] && sleep "$FAKE_SLEEP"
if [ -n "${FAKE_NOT_INSPECTED:-}" ]; then
  echo "  ! 390px ${FAKE_NOT_INSPECTED}: not inspected (no <main> element)"
  echo "check-page-layout: coverage: inspected 92 of 93 (not inspected 1: 0 exempt, 1 failing)"
  exit 1
fi
echo "check-page-layout: coverage: inspected 93 of 93 (not inspected 0: 0 exempt, 0 failing)"
exit 0
FS
run_wrapper() { # NOT_INSPECTED_ROUTE [extra env assignments...] -> RC, OUT, PORT, RUN
  local d; d="$(mktemp -d "$TMP/run.XXXX")"; PORT="${PORT_OVERRIDE:-$(free_port)}"; printf 'default=warn\n' >"$d/modes"
  local r="$1"; shift
  OUT=$(env CHROME=/bin/true PAGE_LAYOUT_BUILD_DIR="${BUILD_OVERRIDE:-$d}" PAGE_LAYOUT_PORT="$PORT" PAGE_LAYOUT_MODES="$d/modes" \
    PAGE_LAYOUT_SERVER_CMD="bash $TMP/fake-server.sh" PAGE_LAYOUT_SEED_CMD="bash $TMP/fake-seed.sh" PAGE_LAYOUT_GUARD_CMD="bash $TMP/fake-guard.sh" \
    FAKE_PID_OUT="$d/pid" FAKE_NOT_INSPECTED="$r" "$@" "$W" 2>&1)
  RC=$?; RUN="$d"
}
run_wrapper "/recipes/1"
[ "$RC" -ne 0 ] && ok || bad "a not-inspected route must fail the wrapper even in warn mode (rc $RC): $OUT"
grep -q 'not inspected' <<<"$OUT" && grep -qi 'FAILED' <<<"$OUT" && ok || bad "the wrapper must say the guard FAILED because of not-inspected routes (got: $OUT)"
run_wrapper ""
[ "$RC" -eq 0 ] && grep -q 'inspected 93 of 93' <<<"$OUT" && ok || bad "a fully inspected run passes and shows the coverage line (rc $RC): $OUT"

# --- PAGE_LAYOUT=full: a guard that did not run is a failure, not a WARN (a skipped guard is lost coverage too)
echo 'exit 3' >"$TMP/fake-seed.sh"
run_wrapper "" PAGE_LAYOUT=full
[ "$RC" -ne 0 ] && ok || bad "full mode: a failed seeder must fail the run, not only warn (rc $RC): $OUT"
echo 'true' >"$TMP/fake-seed.sh"

# --- two runs in one worktree: the second must not stop the first run's server (it killed it through the shared pidfile)
PORT_OVERRIDE="$(free_port)"; BUILD_OVERRIDE="$TMP/shared"; mkdir -p "$BUILD_OVERRIDE"
( run_wrapper "" FAKE_SLEEP=6; echo "$RC" >"$TMP/first.rc" ) &
FIRST=$!
for _ in $(seq 1 40); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT_OVERRIDE/" && break; sleep 0.2; done
run_wrapper "" PAGE_LAYOUT=full
SECOND_RC=$RC
curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT_OVERRIDE/" && ok || bad "a second run on the same port stopped the first run's server"
[ "$SECOND_RC" -ne 0 ] && ok || bad "full mode: a second run that finds its port taken must fail, not exit 0 (rc $SECOND_RC)"
# a refused run fails in quick too (check.sh runs quick: a busy port there means a concurrent run, which must not pass silently)
run_wrapper ""
QUICK_RC=$RC
[ "$QUICK_RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "quick mode: a refused run (the first run holds the port and the lock) must FAIL, not WARN (rc $QUICK_RC): $OUT"
unset PORT_OVERRIDE BUILD_OVERRIDE
wait "$FIRST" 2>/dev/null
[ "$(cat "$TMP/first.rc" 2>/dev/null)" = 0 ] && ok || bad "the first run must still finish OK (rc $(cat "$TMP/first.rc" 2>/dev/null))"

# --- the lock is flock -n on $BUILD/page-layout.lock, held on an fd for the script's life (the kernel drops it when the process dies: no stale handling)
grep -q 'flock -n' "$W" && ok || bad "the wrapper must take its lock with flock -n"
grep -Eq 'mkdir +"?\$LOCK' "$W" && bad "no lock directory: the lock is a flock on a file (nothing stale to detect)" || ok
holder() { # LOCKFILE -> starts a process that holds the flock until killed; HOLDER = its pid
  bash -c 'exec 9>"$1"; flock -n 9 || exit 9; exec sleep 60' _ "$1" &
  HOLDER=$!
  for _ in $(seq 1 25); do flock -n "$1" true 2>/dev/null || break; sleep 0.2; done
}
LB="$TMP/locked"; mkdir -p "$LB"
holder "$LB/page-layout.lock"
for m in quick full; do
  BUILD_OVERRIDE="$LB"; run_wrapper "" PAGE_LAYOUT=$m; LOCK_RC=$RC; unset BUILD_OVERRIDE
  [ "$LOCK_RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "$m: a run refused by a lock held by a live process must FAIL (rc $LOCK_RC): $OUT"
  [ -e "$LB/page-layout.lock" ] && kill -0 "$HOLDER" 2>/dev/null && ! flock -n "$LB/page-layout.lock" true 2>/dev/null && ok || bad "$m: a refused run must leave the lock and its holder alone"
done
kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null
# the holder is dead: the lock file may still be there, and that must not matter
[ -e "$LB/page-layout.lock" ] && ok || bad "(test setup) the lock file should remain after its holder died"
BUILD_OVERRIDE="$LB"; run_wrapper ""; unset BUILD_OVERRIDE
[ "$RC" -eq 0 ] && ok || bad "after the lock holder died, a run must proceed (a leftover lock file is not a lock) (rc $RC): $OUT"

# --- a busy port with a free lock (a foreign server, another build dir): FAIL in quick, and the foreign server is left running
FPORT="$(free_port)"
PORT="$FPORT" setsid nohup node -e 'require("http").createServer((q,s)=>s.end("foreign")).listen(process.env.PORT,"127.0.0.1")' >/dev/null 2>&1 &
FOREIGN=$!
for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$FPORT/" && break; sleep 0.2; done
PORT_OVERRIDE="$FPORT"; run_wrapper ""; unset PORT_OVERRIDE
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "quick: a busy port with a free lock must FAIL (rc $RC): $OUT"
grep -q "$FPORT" <<<"$OUT" && grep -q 'page-layout-server.pid' <<<"$OUT" && ok || bad "the busy-port message must name the port and the pidfile (got: $OUT)"
[ "$(curl -s --max-time 1 "http://127.0.0.1:$FPORT/")" = foreign ] && ok || bad "a refused run must leave the foreign server running"
kill "$FOREIGN" 2>/dev/null

# --- a guard that crashed (exit 1 and no 'check-page-layout: coverage:' line) fails in every mode; the FAILN fallback must not turn it into a pass
echo 'echo boom >&2; exit 1' >"$TMP/crash-guard.sh"
for m in quick full; do
  run_wrapper "" PAGE_LAYOUT=$m PAGE_LAYOUT_GUARD_CMD="bash -c 'echo boom >&2; exit 1'"
  [ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "$m: a guard that exits 1 without a coverage line crashed, and must FAIL (rc $RC): $OUT"
  run_wrapper "" PAGE_LAYOUT=$m PAGE_LAYOUT_GUARD_CMD="bash $TMP/crash-guard.sh"
  [ "$RC" -ne 0 ] && ok || bad "$m: the same crash through a script must fail (rc $RC): $OUT"
done
# findings plus a coverage line, but the modes file cannot be read: the fail count is unknown, so FAIL (never the 'echo 0' fallback)
cat >"$TMP/finding-guard.sh" <<'FS'
echo "  - 1440px /plan: P3 content is 1036px wide"
echo "check-page-layout: coverage: inspected 93 of 93 (not inspected 0: 0 exempt, 0 failing)"
exit 1
FS
run_wrapper "" PAGE_LAYOUT_GUARD_CMD="bash $TMP/finding-guard.sh" PAGE_LAYOUT_MODES="$TMP/no-such-modes"
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "an unreadable modes file must fail the run, not count as 0 failing findings (rc $RC): $OUT"

# --- the driver's usage and exemption-file errors are exit 2, and the wrapper fails on exit 2 in every mode (quick too)
printf 'garbage line with no such route\n' >"$TMP/bad-exempt"
for args in "--url http://127.0.0.1:1 --ids $TMP/ids.json --exempt $TMP/bad-exempt" "--url http://127.0.0.1:1 --ids $TMP/ids.json --exempt $TMP/no-such-exempt" "--ids $TMP/ids.json"; do
  DOUT=$(cd "$ROOT" && CHROME=/bin/true timeout 60 node "$DRV" $args 2>&1); RC=$?
  [ "$RC" -eq 2 ] && ok || bad "driver '$args': an invalid or missing exempt file, or a usage error, must exit 2 (rc $RC): $DOUT"
done
for m in quick full; do
  run_wrapper "" PAGE_LAYOUT=$m PAGE_LAYOUT_GUARD_CMD="bash -c 'echo check-page-layout: bad exemption file >&2; exit 2'"
  [ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ! grep -q '^WARN' <<<"$OUT" && ok || bad "$m: a driver exit 2 (invalid exempt file, usage, could not start the session) must FAIL (rc $RC): $OUT"
done

# --- quick mode: coverage lost is a FAIL whatever the cause (server, seeder, timeouts, session); only no Chrome and no web build stay SKIP/WARN in quick
quick_fails() { # LABEL env... -> asserts rc!=0, FAILED, no WARN line, server stopped
  local label="$1"; shift
  run_wrapper "" "$@"
  [ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ! grep -q '^WARN' <<<"$OUT" && ok || bad "quick: $label must FAIL, not WARN (rc $RC): $OUT"
  server_gone && ok || bad "quick: the server must be stopped after: $label"
}
server_gone() { ! curl -s --max-time 1 "http://127.0.0.1:$PORT/" >/dev/null 2>&1 && { [ ! -s "$RUN/pid" ] || ! kill -0 "$(cat "$RUN/pid")" 2>/dev/null; }; }
echo 'true' >"$TMP/fake-seed.sh"
quick_fails "the server did not start" PAGE_LAYOUT_SERVER_CMD=false
echo 'exit 3' >"$TMP/seed-fails.sh"
quick_fails "a seed failure" PAGE_LAYOUT_SEED_CMD="bash $TMP/seed-fails.sh"
echo 'sleep 30' >"$TMP/hang.sh"
t0=$SECONDS
quick_fails "a seed timeout" PAGE_LAYOUT_SEED_CMD="bash $TMP/hang.sh" PAGE_LAYOUT_SEED_TIMEOUT=2
[ $((SECONDS - t0)) -lt 20 ] && ok || bad "the seed timeout must cut the seeder off quickly"
t0=$SECONDS
quick_fails "a guard timeout" PAGE_LAYOUT_GUARD_CMD="bash $TMP/hang.sh" PAGE_LAYOUT_GUARD_TIMEOUT=2
[ $((SECONDS - t0)) -lt 20 ] && ok || bad "the guard timeout must cut the guard off quickly"
quick_fails "the driver could not start the session (exit 2)" PAGE_LAYOUT_GUARD_CMD="bash -c 'echo check-page-layout: could not start the session >&2; exit 2'"
run_wrapper "" PAGE_LAYOUT=full PAGE_LAYOUT_SERVER_CMD=false
[ "$RC" -ne 0 ] && ok || bad "full: a server that did not start must fail (rc $RC)"

# --- no web build: the server answers the 503 'frontend not built' page. WARN (exit 0) in quick, FAILED in full; the seeder and the guard do not run
rm -f "$TMP/seeded" "$TMP/guarded"
echo "touch $TMP/seeded" >"$TMP/mark-seed.sh"; echo "touch $TMP/guarded" >"$TMP/mark-guard.sh"
nb() { run_wrapper "" FAKE_NO_FRONTEND=1 PAGE_LAYOUT_SEED_CMD="bash $TMP/mark-seed.sh" PAGE_LAYOUT_GUARD_CMD="bash $TMP/mark-guard.sh" "$@"; }
nb
[ "$RC" -eq 0 ] && grep -q '^WARN' <<<"$OUT" && grep -qi 'frontend\|web build' <<<"$OUT" && ok || bad "quick: a server without a web build (503 'frontend not built') must WARN and exit 0 (rc $RC): $OUT"
[ ! -e "$TMP/seeded" ] && [ ! -e "$TMP/guarded" ] && ok || bad "no web build: neither the seeder nor the guard may run"
server_gone && ok || bad "no web build: the server must be stopped"
nb PAGE_LAYOUT=full
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "full: a server without a web build must FAIL (rc $RC): $OUT"
server_gone && ok || bad "no web build (full): the server must be stopped"
# no Chrome: SKIP in quick, FAILED in full
out=$(CHROME=/nonexistent/chrome PAGE_LAYOUT_BUILD_DIR="$TMP/nochrome" "$W" 2>&1); rc=$?
[ "$rc" -eq 0 ] && grep -q 'SKIP' <<<"$out" && ok || bad "quick: no Chrome stays a SKIP with exit 0 (rc $rc): $out"
out=$(CHROME=/nonexistent/chrome PAGE_LAYOUT=full PAGE_LAYOUT_BUILD_DIR="$TMP/nochrome" "$W" 2>&1); rc=$?
[ "$rc" -ne 0 ] && grep -q 'FAILED' <<<"$out" && ok || bad "full: no Chrome must FAIL (rc $rc): $out"

# --- the OK line shows the probe count from the coverage summary
run_wrapper ""
grep -Eq 'page layout guard: OK \(quick profile, 93 probes' <<<"$OUT" && ok || bad "the OK line must read 'OK (quick profile, 93 probes, ...)' with the count from the coverage summary (got: $OUT)"

# --- check.sh takes its own per-worktree flock -n (build/check.lock) before it touches check.log; a refused run fails and leaves the log alone
grep -q 'flock -n' "$ROOT/scripts/check.sh" && ok || bad "scripts/check.sh must take a per-worktree flock -n (build/check.lock)"
CK="$TMP/ck"; mkdir -p "$CK/scripts" "$CK/web/src" "$CK/build"
cp "$ROOT/scripts/check.sh" "$ROOT/scripts/check-ui.sh" "$ROOT/scripts/check-ui.rules" "$CK/scripts/"
printf 'evidence of the first run\n' >"$CK/build/check.log"
cp "$CK/build/check.log" "$TMP/check.log.before"
holder "$CK/build/check.lock"
OUT=$(CHECK_ONLY=ui timeout 60 bash "$CK/scripts/check.sh" 2>&1); RC=$?
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "check.sh must refuse (FAILED, non-zero) while build/check.lock is held by a live process (rc $RC): $OUT"
cmp -s "$CK/build/check.log" "$TMP/check.log.before" && ok || bad "a refused check.sh must leave build/check.log byte-identical (got: $(cat "$CK/build/check.log"))"
kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null
OUT=$(CHECK_ONLY=ui timeout 60 bash "$CK/scripts/check.sh" 2>&1); RC=$?
[ "$RC" -eq 0 ] && ok || bad "after the check.lock holder died, check.sh must run (rc $RC): $OUT"

printf 'check-page-layout-coverage_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
