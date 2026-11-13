#!/usr/bin/env bash
# hf-recipes-filter: the Recipes filter header in a browser (docs/design/recipes-filter.md 1, 11, 13). The real driver runs against a
# tiny static server (fixtures/page-layout-recipes-header):
#   /plan      crushed.html  the beta.6 Tag row with 40 Tags: every chip crushed to its dot (P16);
#   /recipes   round1.html   bb354d3c as the review saw it, with Side and a long Tag on and the panel open: the Tag chip cut beside
#                            "Side" (P17 at 390), hit areas and the ring of "All Courses" clipped (P18), the popover start-aligned
#                            past the page (P19 at 834 and 1440), row 3 flush under row 2 and the panel sections unspaced (P20);
#                            Round 3: between 420 and 440 px it logs a console error, throws and shows the error page (P21, found
#                            by the RESIZE_WALK of the filtered scenario, 360 to 480 px); and on a live resize through 453 to 455 px
#                            it shows the error page and logs an error (P21 "(live resize)", found only by the 1 px RESIZE_SWEEP);
#   /settings  fixed.html    the same state laid out as round 2 says: clean of P1, P13, P14 and P16 to P20 at every width.
# The real build is covered by the guard itself (check.sh), which probes /recipes and its SCENARIOS. No Chrome: SKIP.
set -uo pipefail
for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FIX="$HERE/fixtures/page-layout-recipes-header"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
TMP="$(mktemp -d)"
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"
if [ -z "$CHROME_BIN" ]; then
  echo "SKIP: Chrome not found; page-layout-recipes-header_test.sh did not run"
  exit 0
fi

cat >"$TMP/server.cjs" <<'JS'
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.env.FIX
http.createServer((q, s) => {
  if (q.url.startsWith('/api/')) { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.setHeader('content-type', 'text/html')
  const file = q.url.startsWith('/settings') ? 'fixed.html' : q.url.startsWith('/recipes') ? 'round1.html' : 'crushed.html'
  s.end(fs.readFileSync(path.join(dir, file)))
}).listen(Number(process.env.PORT), '127.0.0.1')
JS
# A free port: one already in use (another worktree's server) would answer the guard instead of these fixtures, and its sign-in
# would fail ("could not start the session"). So a taken port is skipped, and a server that died on start is replaced.
PORT=""
for try in 0 1 2 3 4 5 6 7; do
  p=$((40000 + ($(printf '%s' "$ROOT$$recipes$try" | cksum | cut -d' ' -f1) % 9000)))
  curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$p/" && continue
  FIX="$FIX" PORT="$p" node "$TMP/server.cjs" >/dev/null 2>&1 &
  SERVER=$!
  for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$p/" && break; sleep 0.2; done
  if kill -0 "$SERVER" 2>/dev/null; then PORT=$p; break; fi
  SERVER=""
done
[ -n "$PORT" ] || { echo "FAIL: no free port for the fixture server"; exit 1; }
echo '{"recipeId":1,"ingredientId":1,"productId":1,"shopId":1,"sideCourseId":2,"longTag":"HEARTY HOMEMADE MUSHROOM WELLINGTONS"}' >"$TMP/ids.json"
OUT="$(cd "$ROOT" && CHROME="$CHROME_BIN" PAGE_LAYOUT_ONLY='^/(plan|recipes|settings)$' timeout 180 node scripts/check-page-layout.mjs --url "http://127.0.0.1:$PORT" --ids "$TMP/ids.json" 2>&1)"

# the beta.6 Tag row (/plan): its chips are crushed at a phone and both iPad portrait widths
for w in 390 834 1024; do
  grep -Eq "^\s+- ${w}px /plan: P16 " <<<"$OUT" && ok || bad "${w}px /plan: the crushed Tag row must be a P16 finding (got: $OUT)"
done
# P16 fails in every mode (ALWAYS_FAIL), so the guard's count-fail sees it on a warn route (only those lines are fed in)
COUNT="$(cd "$ROOT" && grep -E '^\s+- [0-9]+px /plan: P16 ' <<<"$OUT" | node scripts/lib/page-layout-modes.mjs count-fail scripts/check-page-layout.modes 2>/dev/null)"
[ "${COUNT:-0}" -gt 0 ] && ok || bad "the P16 findings must count as failures (count-fail said '${COUNT:-}')"

# round 1 (/recipes, and its SCENARIOS, which this static server answers with the same page)
grep -Eq "^\s+- 390px /recipes[^:]*: P17 .*HEARTY HOMEMADE" <<<"$OUT" && ok || bad "390px /recipes: the cut Tag chip beside Side must be a P17 finding naming it (got: $OUT)"
for w in 390 834 1024 1440 1920; do
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P18 .*hit area" <<<"$OUT" && ok || bad "${w}px /recipes: the clipped hit areas of the chip line must be a P18 finding (got: $OUT)"
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P18 .*All Courses.*focus ring" <<<"$OUT" && ok || bad "${w}px /recipes: the clipped focus ring of All Courses must be a P18 finding (got: $OUT)"
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P20 " <<<"$OUT" && ok || bad "${w}px /recipes: row 3 flush under row 2 must be a P20 finding (got: $OUT)"
done
for w in 834 1440; do
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P19 " <<<"$OUT" && ok || bad "${w}px /recipes: the start-aligned popover must be a P19 finding (got: $OUT)"
done
# P17 to P20 fail in every mode
COUNT="$(cd "$ROOT" && grep -E '^\s+- [0-9]+px /recipes[^:]*: P(17|18|19|20) ' <<<"$OUT" | node scripts/lib/page-layout-modes.mjs count-fail scripts/check-page-layout.modes 2>/dev/null)"
[ "${COUNT:-0}" -gt 0 ] && ok || bad "the P17-P20 findings must count as failures (count-fail said '${COUNT:-}')"

# round 3: the RESIZE_WALK of the filtered /recipes (360 to 480 px) finds the page broken between 420 and 440 px, and only there
for w in 420 430 440; do
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P21 " <<<"$OUT" && ok || bad "${w}px /recipes: the broken page must be a P21 finding (got: $OUT)"
done
for w in 360 400 410 450 480; do
  grep -Eq "^\s+- ${w}px /recipes[^:]*: P21 " <<<"$OUT" && bad "${w}px /recipes: no P21 expected where the page works (got: $OUT)" || ok
done
# review of round 3: the live 1 px RESIZE_SWEEP finds the break that only a resize triggers, in 453 to 455 px (between the walk's steps)
grep -Eq "^\s+- 45[345]px /recipes[^:]*\(live resize\): P21 " <<<"$OUT" && ok || bad "the live resize sweep must find the break at 453-455 px (got: $OUT)"
COUNT="$(cd "$ROOT" && grep -E '^\s+- [0-9]+px /recipes[^:]*: P21 ' <<<"$OUT" | node scripts/lib/page-layout-modes.mjs count-fail scripts/check-page-layout.modes 2>/dev/null)"
[ "${COUNT:-0}" -gt 0 ] && ok || bad "the P21 findings must count as failures (count-fail said '${COUNT:-}')"

# round 2 (/settings) is clean at every quick-profile width
for rule in P1 P13 P14 P16 P17 P18 P19 P20; do
  grep -Eq "^\s+- [0-9]+px /settings: ${rule} " <<<"$OUT" && bad "the round-2 header (/settings) must have no ${rule} finding (got: $OUT)" || ok
done
# and it was inspected at all five widths
for w in 390 834 1024 1440 1920; do
  grep -Eq "^\s+! ${w}px /settings" <<<"$OUT" && bad "${w}px /settings was not inspected (got: $OUT)" || ok
done

printf 'page-layout-recipes-header_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
