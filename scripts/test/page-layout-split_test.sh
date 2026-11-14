#!/usr/bin/env bash
# check-profile: browser (runs the wrapper with CHROME set to a stub; the guard itself is faked)
# B9-03 (guard-split): the page-layout guard's hooks that every later package hangs its own files on, tested without a browser:
#   - scripts/check-page-layout.modes.d/*   more mode lines, read after scripts/check-page-layout.modes (the directory of a modes file F is F.d)
#   - check-page-layout.sh --scenario NAME  passes --scenario NAME to the driver; the driver refuses an unknown name (exit 2) before it starts Chrome
#   - the directories and the seed split of plan section 3 / 5 exist
# The pure registry (rules, probes, scenarios, profiles, viewports) is tested in web/src/app/pageLayoutRegistry.test.ts.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
W="$ROOT/scripts/check-page-layout.sh"
MODES_JS="$ROOT/scripts/lib/page-layout-modes.mjs"
DRV="$ROOT/scripts/check-page-layout.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

# --- the places a package puts its own files (plan section 5: "named <slug>.* or Pnn-*")
for d in scripts/check-ui.d scripts/check-ui.rules.d scripts/check-page-layout.modes.d scripts/lib/page-layout/rules scripts/lib/page-layout/probes \
  scripts/lib/page-layout/scenarios scripts/test/fixtures/page-layout-seed; do
  [ -d "$ROOT/$d" ] && ok || bad "$d/ must exist (the hook directory a package adds its files to)"
done

# --- modes.d: <modes file>.d/* is read after the modes file, for --mode-of and for count-fail
m="$TMP/m"; mkdir -p "$m/modes.d"
printf 'default=warn\nfail_routes=/plan\n' >"$m/modes"
[ "$(node "$MODES_JS" mode-of "$m/modes" /shop 2>/dev/null)" = warn ] && ok || bad "without a modes.d file /shop is warn"
printf '# B9-99: the Shop adopts the guard\nfail_routes=/shop /shop/*\n' >"$m/modes.d/b9-99.modes"
[ "$(node "$MODES_JS" mode-of "$m/modes" /shop 2>/dev/null)" = fail ] && ok || bad "modes.d/b9-99.modes: fail_routes=/shop must make /shop fail"
[ "$(node "$MODES_JS" mode-of "$m/modes" /plan 2>/dev/null)" = fail ] && ok || bad "the modes file's own fail_routes still hold with a modes.d file"
[ "$(node "$MODES_JS" mode-of "$m/modes" /pantry 2>/dev/null)" = warn ] && ok || bad "a route in no file stays warn"
printf 'warn_routes=/plan\n' >"$m/modes.d/b9-98.modes"
[ "$(node "$MODES_JS" mode-of "$m/modes" /plan 2>/dev/null)" = warn ] && ok || bad "a warn_routes line of a modes.d file wins over fail_routes (the existing rule), whichever file holds it"
rm "$m/modes.d/b9-98.modes"
out=$(printf '%s\n' "  - 1440px /shop: P3 content is 1036px wide" "  - 1440px /pantry: P3 content is 1036px wide" | node "$MODES_JS" count-fail "$m/modes" 2>/dev/null)
[ "$out" = 1 ] && ok || bad "count-fail must read modes.d too: /shop fails, /pantry warns, so 1 (got '$out')"
[ "$(PAGE_LAYOUT_MODES="$m/modes" "$W" --mode-of /shop 2>/dev/null)" = fail ] && ok || bad "check-page-layout.sh --mode-of reads modes.d"
# the real tree: a modes.d directory next to the real modes file; the real modes file keeps its default=warn first line
[ "$(grep -c '^default=warn$' "$ROOT/scripts/check-page-layout.modes")" = 1 ] && ok || bad "check-page-layout.modes keeps its one default=warn line"

# --- a full run (fakes as in check-page-layout_test.sh) that needs modes.d to fail, and --scenario passed through
cat >"$TMP/fake-server.sh" <<'FS'
echo $$ >"$FAKE_PID_OUT"
exec node -e 'require("http").createServer((q,s)=>s.end("ok")).listen(process.env.PORT,"127.0.0.1")'
FS
cat >"$TMP/fake-guard.sh" <<'FS'
echo "$@" >"$FAKE_GUARD_OUT"
if [ -n "${FAKE_FINDING:-}" ]; then
  echo "check-page-layout: 1 failure(s)"
  echo "  - ${FAKE_WIDTH:-1440}px ${FAKE_FINDING}: ${FAKE_RULE:-P3} content is 1036px wide"
  exit 1
fi
exit 0
FS
free_port() { node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'; }
run_wrapper() { # FINDING_ROUTE MODES_DIR_FILES... -> RC, OUT, RUN  (extra wrapper arguments in WARGS)
  local d; d="$(mktemp -d "$TMP/run.XXXX")"; PORT="$(free_port)"
  printf 'default=warn\n' >"$d/modes"
  if [ -n "${MODES_D_LINE:-}" ]; then mkdir -p "$d/modes.d"; printf '%s\n' "$MODES_D_LINE" >"$d/modes.d/team.modes"; fi
  OUT=$(CHROME=/bin/true PAGE_LAYOUT_BUILD_DIR="$d" PAGE_LAYOUT_PORT="$PORT" PAGE_LAYOUT_MODES="$d/modes" \
    PAGE_LAYOUT_SERVER_CMD="bash $TMP/fake-server.sh" PAGE_LAYOUT_SEED_CMD="true" PAGE_LAYOUT_GUARD_CMD="bash $TMP/fake-guard.sh" \
    FAKE_PID_OUT="$d/pid" FAKE_GUARD_OUT="$d/guard" FAKE_FINDING="$1" FAKE_WIDTH="${FAKE_WIDTH:-1440}" FAKE_RULE="${FAKE_RULE:-P3}" "$W" ${WARGS:-} 2>&1)
  RC=$?; RUN="$d"
}
MODES_D_LINE="" WARGS="" run_wrapper "/shop"
[ "$RC" -eq 0 ] && grep -q 'WARN' <<<"$OUT" && ok || bad "a finding on /shop with no fail route warns and exits 0 (rc $RC)"
MODES_D_LINE='fail_routes=/shop' WARGS="" run_wrapper "/shop"
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "a finding on /shop that a modes.d file makes a fail route must fail the run (rc $RC)"

MODES_D_LINE="" WARGS="" run_wrapper ""
grep -q -- '--scenario' "$RUN/guard" 2>/dev/null && bad "without --scenario the guard gets none ($(cat "$RUN/guard"))" || ok
MODES_D_LINE="" WARGS="--scenario shop-hints" run_wrapper ""
[ "$RC" -eq 0 ] && grep -q -- '--scenario shop-hints' "$RUN/guard" 2>/dev/null && ok || bad "check-page-layout.sh --scenario shop-hints must pass --scenario shop-hints to the guard (rc $RC, args: $(cat "$RUN/guard" 2>/dev/null))"
grep -q -- '--url http://127.0.0.1:' "$RUN/guard" 2>/dev/null && grep -q -- '--profile quick' "$RUN/guard" 2>/dev/null && ok || bad "--scenario must not drop --url and --profile ($(cat "$RUN/guard" 2>/dev/null))"
MODES_D_LINE="" WARGS="--scenario shop-hints,shop-header" run_wrapper ""
grep -q -- '--scenario shop-hints,shop-header' "$RUN/guard" 2>/dev/null && ok || bad "a comma list of scenarios is passed as it is"
OUT=$(CHROME=/bin/true PAGE_LAYOUT_BUILD_DIR="$TMP/noname" PAGE_LAYOUT_SERVER_CMD="true" PAGE_LAYOUT_SEED_CMD="true" PAGE_LAYOUT_GUARD_CMD="true" "$W" --scenario 2>&1); RC=$?
[ "$RC" -eq 2 ] && grep -qi 'usage' <<<"$OUT" && ok || bad "--scenario without a name must exit 2 with a usage message (rc $RC): $OUT"

# --- the warn bridge: a "width<=N = warn" line (a modes.d drop-in) makes every finding at a profile viewport of N px or less a warning,
# fail routes and always-fail rules included, and the run prints the count. Without it the same finding fails; wider ones fail either way.
BRIDGE=$'fail_routes=/shop\nwidth<=375 = warn until B9-55'
FAKE_WIDTH=375 MODES_D_LINE="$BRIDGE" WARGS="" run_wrapper "/shop"
[ "$RC" -eq 0 ] && ok || bad "with the bridge a 375 px finding on a fail route must not fail the run (rc $RC): $OUT"
grep -q '375px /shop: P3' <<<"$OUT" && ok || bad "the bridged finding is still printed: $OUT"
grep -q '^375 px: 1 finding, warn until B9-55$' <<<"$OUT" && ok || bad "the run prints '375 px: 1 finding, warn until B9-55': $OUT"
FAKE_WIDTH=375 FAKE_RULE=P1 MODES_D_LINE='width<=375 = warn' WARGS="" run_wrapper "/pantry"
[ "$RC" -eq 0 ] && ok || bad "the bridge covers an always-fail rule (P1) too (rc $RC): $OUT"
FAKE_WIDTH=375 MODES_D_LINE='fail_routes=/shop' WARGS="" run_wrapper "/shop"
[ "$RC" -ne 0 ] && grep -q 'FAILED' <<<"$OUT" && ok || bad "without the bridge the same 375 px finding fails (rc $RC)"
FAKE_WIDTH=390 MODES_D_LINE="$BRIDGE" WARGS="" run_wrapper "/shop"
[ "$RC" -ne 0 ] && ok || bad "a 390 px finding on a fail route fails with the bridge (rc $RC)"
grep -q '^375 px: 0 findings, warn until B9-55$' <<<"$OUT" && ok || bad "a bridge that covered nothing says 0: $OUT"
FAKE_WIDTH=375 MODES_D_LINE="$BRIDGE" WARGS="" run_wrapper "/shop#zoom-reflow"
[ "$RC" -ne 0 ] && ok || bad "a scenario finding (<route>#<name>, its own viewport, e.g. 375x256) is not bridged (rc $RC)"
for line in 'width<=375 = fail' 'width<375 = warn' 'fail_route=/shop' 'default=maybe' 'just words'; do
  MODES_D_LINE="$line" WARGS="" run_wrapper ""
  [ "$RC" -ne 0 ] && grep -q 'does not know' <<<"$OUT" && grep -qF "$line" <<<"$OUT" && ok || bad "a modes.d line the guard does not know ('$line') must fail the run and be named (rc $RC): $OUT"
done
[ ! -e "$ROOT/scripts/check-page-layout.modes.d/10-width-375-warn" ] || grep -q 'Removed by B9-55' "$ROOT/scripts/check-page-layout.modes.d/10-width-375-warn" && ok || bad "a 10-width-375-warn drop-in says it is removed by B9-55"

# --- the driver: an unknown scenario is a usage error, before Chrome starts (no Chrome is needed for this)
OUT=$(cd "$ROOT" && CHROME=/nonexistent/chrome timeout 30 node "$DRV" --url http://127.0.0.1:1 --ids "$TMP/ids.json" --scenario no-such-scenario 2>&1); RC=$?
[ "$RC" -eq 2 ] && grep -q 'no-such-scenario' <<<"$OUT" && grep -qi 'unknown scenario' <<<"$OUT" && ok || bad "the driver must exit 2 and name an unknown --scenario (rc $RC): $OUT"
grep -qi 'cannot start Chrome' <<<"$OUT" && bad "the unknown scenario must be refused before Chrome is started: $OUT" || ok
OUT=$(cd "$ROOT" && CHROME=/nonexistent/chrome timeout 30 node "$DRV" --url http://127.0.0.1:1 --ids "$TMP/ids.json" --scenario shop-hints 2>&1); RC=$?
grep -qi 'unknown scenario' <<<"$OUT" && bad "shop-hints is a real scenario and must not be refused: $OUT" || ok

# --- the seed is split by area: an entry file, an index and one module per area
SEEDDIR="$ROOT/scripts/test/fixtures/page-layout-seed"
SEED="$ROOT/scripts/test/fixtures/page-layout-seed.mjs"
for a in household recipes shops stock plan supplies scan; do
  [ -f "$SEEDDIR/$a.mjs" ] && ok || bad "scripts/test/fixtures/page-layout-seed/$a.mjs (the $a area of the seed) is missing"
done
[ -f "$SEEDDIR/index.mjs" ] && ok || bad "scripts/test/fixtures/page-layout-seed/index.mjs (AREAS, seedAll) is missing"
if [ -f "$SEEDDIR/index.mjs" ]; then
  out=$(node --input-type=module -e "
import * as idx from '$SEEDDIR/index.mjs'
const want = ['household', 'recipes', 'shops', 'stock', 'plan', 'supplies', 'scan']
const bad = []
if (!Array.isArray(idx.AREAS)) bad.push('AREAS is not an array')
else for (const a of want) if (!idx.AREAS.includes(a)) bad.push('AREAS lacks ' + a)
if (typeof idx.seedAll !== 'function') bad.push('seedAll is not a function')
for (const a of idx.AREAS ?? []) {
  const m = await import('$SEEDDIR/' + a + '.mjs')
  if (typeof m.seed !== 'function') bad.push(a + '.mjs does not export seed(ctx)')
}
console.log(bad.join('; ') || 'ok')
" 2>&1)
  [ "$out" = ok ] && ok || bad "page-layout-seed/index.mjs: $out"
fi
# a package's own seed area is found without editing index.mjs: after the base areas, by its order; a module without order fails loudly
cp -r "$SEEDDIR" "$TMP/seed" && cp "$ROOT/scripts/test/fixtures/page-layout-seed-zones.mjs" "$TMP/" 2>/dev/null
# the packages' real drop-ins (recipe-editor.mjs, B9-10, ...) are left out of the copy: this case checks the mechanism, not who uses it
for f in "$TMP"/seed/*.mjs; do case "$(basename "$f" .mjs)" in index | household | recipes | shops | stock | plan | supplies | scan) ;; *) rm -f "$f" ;; esac; done
printf 'export const order = 200\nexport async function seed() {}\n' >"$TMP/seed/zz-late.mjs"
printf 'export const order = 100\nexport async function seed() {}\n' >"$TMP/seed/zz-early.mjs"
out=$(node --input-type=module -e "import('$TMP/seed/index.mjs').then((m) => console.log(m.AREAS.join(',')), (e) => console.log('THROWS ' + e.message))" 2>&1)
[ "$out" = household,recipes,shops,stock,plan,supplies,scan,zz-early,zz-late ] && ok || bad "seed drop-ins run after the base areas, by order (got $out)"
printf 'export async function seed() {}\n' >"$TMP/seed/zz-noorder.mjs"
out=$(node --input-type=module -e "import('$TMP/seed/index.mjs').then((m) => console.log(m.AREAS.join(',')), (e) => console.log('THROWS ' + e.message))" 2>&1)
grep -q 'THROWS.*zz-noorder.mjs' <<<"$out" && ok || bad "a seed area without order must throw and be named (got $out)"
# the entry keeps what check-page-layout_test.sh pins (login, the ids file, a timeout on every fetch) and no longer holds the whole seed
grep -q '/api/dev/login' "$SEED" && grep -q 'page-layout-ids' "$SEED" && grep -q 'AbortSignal.timeout' "$SEED" && ok || bad "the seed entry keeps dev login, the ids file and AbortSignal.timeout"
grep -q 'page-layout-seed/index.mjs' "$SEED" && ok || bad "the seed entry must import page-layout-seed/index.mjs"
[ "$(wc -l <"$SEED")" -lt 160 ] && ok || bad "the seed entry must shrink to the login, the helpers and the ids file (< 160 lines, was 330); the steps live in page-layout-seed/<area>.mjs"
# the ids file keeps its keys (the driver's :id routes and scenarios read them): every one is still written somewhere in the seed
SEEDALL="$(cat "$SEED" "$SEEDDIR"/*.mjs 2>/dev/null)"
for k in recipeId ingredientId productId shopId supplyId sideCourseId longTag longPlaceId; do
  grep -q "\b$k\b" <<<"$SEEDALL" && ok || bad "the ids file key $k must still be written by the seed"
done

printf 'page-layout-split_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
