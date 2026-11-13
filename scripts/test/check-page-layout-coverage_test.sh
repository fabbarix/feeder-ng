#!/usr/bin/env bash
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
grep -q '^entries [0-9]' <<<"$out" && ok || bad "the shipped exemption list must parse (got: $out)"
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
  grep -q 'coverage: inspected 0 of 3 (not inspected 3: 0 exempt, 3 failing)' <<<"$DOUT" && ok || bad "the summary must count inspected and not inspected routes (got: $DOUT)"
  grep -q 'check-page-layout: OK' <<<"$DOUT" && bad "the guard must not print OK when routes were not inspected" || ok
  # an explicit exemption turns that route's lines into 'exempt' and the run passes
  printf '/settings test fixture: this server renders no app\n' >"$TMP/b/exempt"
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/settings$' timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT" --ids "$TMP/b/ids.json" --exempt "$TMP/b/exempt" 2>&1); RC=$?
  [ "$RC" -eq 0 ] && grep -q '3 exempt, 0 failing' <<<"$DOUT" && ok || bad "an exempt route that cannot be probed passes and is counted as exempt (rc $RC): $DOUT"
  # a server that dies while the guard runs is the same thing: not inspected, never OK
  pkill -f "$TMP/nomain.js" 2>/dev/null
  DOUT=$(cd "$ROOT" && CHROME="$REAL" PAGE_LAYOUT_ONLY='^/settings$' PAGE_LAYOUT_CDP_TIMEOUT_MS=3000 timeout 120 node "$DRV" --url "http://127.0.0.1:$PORT" --ids "$TMP/b/ids.json" 2>&1); RC=$?
  [ "$RC" -ne 0 ] && ok || bad "a dead server must never end in OK (rc $RC): $DOUT"
fi

# --- the wrapper: not-inspected lines fail the run in any mode (warn included); an exempt-only run passes
cat >"$TMP/fake-server.sh" <<'FS'
echo $$ >"$FAKE_PID_OUT"
exec node -e 'require("http").createServer((q,s)=>s.end("ok")).listen(process.env.PORT,"127.0.0.1")'
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

# --- a lock held by a live run refuses a run in this worktree in every mode, and the refused run leaves that lock alone
LB="$TMP/locked"; mkdir -p "$LB/page-layout.lock"; echo $$ >"$LB/page-layout.lock/pid"
BUILD_OVERRIDE="$LB"; run_wrapper ""; LOCK_RC=$RC; unset BUILD_OVERRIDE
[ "$LOCK_RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "a run refused by the lock must FAIL in quick (rc $LOCK_RC): $OUT"
[ -d "$LB/page-layout.lock" ] && ok || bad "a refused run must not remove the lock of the run that holds it"

printf 'check-page-layout-coverage_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
