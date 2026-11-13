#!/usr/bin/env bash
# DS-A round 2: horizontal overflow fails the page-layout guard in EVERY mode (the Plan review: Course rows 582 px wide in a
# 358 px day tile, the page 614 px wide on a 390 phone, and the guard printed OK).
#   (a) P1  the document is wider than the viewport (sideways page scroll), or a box ends past the viewport's right edge. Under
#           phone emulation `innerWidth` grows with the content (614 at 390), so the edge is documentElement.clientWidth.
#   (b) P13 a box's content is wider than its tile or card (.tile, .list-group, a BentoGrid child) and spills past it, with no
#           intentional scroll container (overflow-x auto / scroll) between them; clipped by overflow hidden counts too.
# P1 and P13 are in ALWAYS_FAIL (scripts/lib/page-layout-rules.mjs): count-fail counts them on warn routes as well.
# The real driver runs against a tiny static server (fixtures/page-layout-overflow): /plan is a no-wrap row in a `1fr` grid,
# /settings the same row in an overflow-x: auto strip with minmax(0, 1fr) tracks, /pantry (round 3) an absolute corner menu (no
# finding) beside an in-flow svg spill (a finding). No Chrome: SKIP.
set -uo pipefail
for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FIX="$HERE/fixtures/page-layout-overflow"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
TMP="$(mktemp -d)"
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# --- pure parts: the always-fail rules and the mode mapping (no Chrome needed) ----------------------------------------------
node -e "import('$ROOT/scripts/lib/page-layout-rules.mjs').then((m) => process.exit(Array.isArray(m.ALWAYS_FAIL) && m.ALWAYS_FAIL.includes('P1') && m.ALWAYS_FAIL.includes('P13') ? 0 : 1))" 2>/dev/null \
  && ok || bad "page-layout-rules.mjs must export ALWAYS_FAIL with P1 and P13"
printf 'default=warn\n' >"$TMP/modes-warn"
printf '  - 390px /plan: P1 sideways scroll (scrollWidth 614 > 390)\n  - 1024px /plan: P13 span.course__chips overflows its section.tile by 120 px\n  - 1024px /plan: P11 p.x: mid-word\n' >"$TMP/findings"
n="$(node "$ROOT/scripts/lib/page-layout-modes.mjs" count-fail "$TMP/modes-warn" <"$TMP/findings" 2>/dev/null)"
[ "$n" = 2 ] && ok || bad "count-fail must count P1 and P13 on a warn route (expected 2 of the 3 lines, got '$n')"

CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"
if [ -z "$CHROME_BIN" ]; then
  echo "SKIP: Chrome not found; the behavioural part of page-layout-overflow_test.sh did not run"
  printf 'page-layout-overflow_test: %d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" -eq 0 ]; exit
fi

# --- a static server: dev login answers {}, /settings is the scroller page, every other page the overflow page -------------
PORT=$((40000 + $(printf '%s' "$ROOT$$" | cksum | cut -d' ' -f1) % 9000))
cat >"$TMP/server.cjs" <<'JS'
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.env.FIX
http.createServer((q, s) => {
  if (q.method === 'POST' && q.url === '/api/dev/login') { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  if (q.url.startsWith('/api/')) { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.setHeader('content-type', 'text/html')
  const page = q.url.startsWith('/settings') ? 'scroller.html' : q.url.startsWith('/pantry') ? 'corner.html' : 'overflow.html'
  s.end(fs.readFileSync(path.join(dir, page)))
}).listen(Number(process.env.PORT), '127.0.0.1')
JS
FIX="$FIX" PORT="$PORT" node "$TMP/server.cjs" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
echo '{"recipeId":1,"ingredientId":1,"productId":1,"shopId":1}' >"$TMP/ids.json"
OUT="$(cd "$ROOT" && CHROME="$CHROME_BIN" PAGE_LAYOUT_ONLY='^/(plan|settings|pantry)$' timeout 180 node scripts/check-page-layout.mjs --url "http://127.0.0.1:$PORT" --ids "$TMP/ids.json" 2>&1)"; RC=$?
[ "$RC" -eq 1 ] && ok || bad "the driver must exit 1 (findings) on the overflow page (rc $RC): $OUT"

# (a) the 390 phone: the document is wider than the viewport
grep -Eq '^\s+- 390px /plan: P1 ' <<<"$OUT" && ok || bad "390px /plan: a no-wrap row in a 1fr grid must be a P1 finding (got: $OUT)"
# (a) under phone emulation the right edge is clientWidth, not innerWidth: the boxes past it are named
grep -Eq '^\s+- 390px /plan: P1 elements past the right edge' <<<"$OUT" && ok || bad "390px /plan: P1 must name the elements past the right edge (clientWidth, not the emulated innerWidth)"
# (b) the tile: its content is wider than the tile, at a tablet and a desktop width
for w in 834 1024 1440; do
  grep -Eq "^\s+- ${w}px /plan: P13 .*(course|chip).*section\.tile" <<<"$OUT" && ok || bad "${w}px /plan: the chip row wider than its tile must be a P13 finding naming both (got: $OUT)"
done
# an intentional scroll container with minmax(0, 1fr) tracks is clean
grep -Eq '^\s+- [0-9]+px /settings: P(1|13) ' <<<"$OUT" && bad "/settings (an overflow-x: auto strip) must have no P1 or P13 finding (got: $OUT)" || ok

# round 3: P13 counts in-flow spills only. An absolutely positioned corner menu in the tile's padding (.plan-hero__menu) is no
# finding; an in-flow row of svg icons wider than its tile is, and the svg is named by its class attribute.
grep -Eq '^\s+- [0-9]+px /pantry: P13 .*(corner-menu|button\.).*corner' <<<"$OUT" && bad "/pantry: an absolutely positioned corner menu in the tile's padding must not be a P13 finding (got: $OUT)" || ok
grep -Eq '^\s+- [0-9]+px /pantry: P13 [^ ]*corner-menu' <<<"$OUT" && bad "/pantry: .corner-menu (position: absolute) must not be a P13 finding" || ok
for w in 834 1024 1440; do
  grep -Eq "^\s+- ${w}px /pantry: P13 .*svg\.spill-icon.*section\.tile" <<<"$OUT" && ok || bad "${w}px /pantry: the in-flow svg wider than its tile must be a P13 finding naming svg.spill-icon (got: $(grep "${w}px /pantry" <<<"$OUT" | head -4))"
done
grep -q 'object SVGAnimatedString\|svg\.\[object' <<<"$OUT" && bad "an svg must be named by getAttribute('class'), never '[object SVGAnimatedString]'" || ok

# every mode: the real findings count as failures on a warn-only modes file
n="$(node "$ROOT/scripts/lib/page-layout-modes.mjs" count-fail "$TMP/modes-warn" <<<"$OUT" 2>/dev/null)"
[ -n "$n" ] && [ "$n" -gt 0 ] && ok || bad "with default=warn the overflow findings must still count as failures (count-fail said '$n')"

printf 'page-layout-overflow_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
