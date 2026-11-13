#!/usr/bin/env bash
# hf-recipes-filter: the Recipes filter header in a browser (docs/design/recipes-filter.md 1, 11). Rule P16 of the page-layout
# guard: a chip whose label is crushed (cut by its ellipsis to under 24 px) is a finding even when its line is full, which is
# what the beta.6 Tag row did with 25+ Tags (every Tag a dot with no name, in a sideways-scrolling row that P1, P13 and P14 let
# through). The real driver runs against a tiny static server (fixtures/page-layout-recipes-header): /recipes is the beta.6
# header with 40 Tags (crushed.html); /settings is the new header with a Course and a Tag on (fixed.html), which must be clean
# of P1, P13, P14 and P16 at every quick-profile width. No Chrome: SKIP.
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

PORT=$((40000 + $(printf '%s' "$ROOT$$recipes" | cksum | cut -d' ' -f1) % 9000))
cat >"$TMP/server.cjs" <<'JS'
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.env.FIX
http.createServer((q, s) => {
  if (q.url.startsWith('/api/')) { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.setHeader('content-type', 'text/html')
  s.end(fs.readFileSync(path.join(dir, q.url.startsWith('/settings') ? 'fixed.html' : 'crushed.html')))
}).listen(Number(process.env.PORT), '127.0.0.1')
JS
FIX="$FIX" PORT="$PORT" node "$TMP/server.cjs" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
echo '{"recipeId":1,"ingredientId":1,"productId":1,"shopId":1}' >"$TMP/ids.json"
OUT="$(cd "$ROOT" && CHROME="$CHROME_BIN" PAGE_LAYOUT_ONLY='^/(recipes|settings)$' timeout 180 node scripts/check-page-layout.mjs --url "http://127.0.0.1:$PORT" --ids "$TMP/ids.json" 2>&1)"

# the beta.6 Tag row: its chips are crushed at a phone, both iPad portrait widths
for w in 390 834 1024; do
  grep -Eq "^\s+- ${w}px /recipes: P16 " <<<"$OUT" && ok || bad "${w}px /recipes: the crushed Tag row must be a P16 finding (got: $OUT)"
done
# P16 fails in every mode (ALWAYS_FAIL), so the guard's count-fail sees it on /recipes, a warn route (only its P16 lines are fed in:
# /settings is a fail route, where the fixture's page-width findings would count anyway)
COUNT="$(cd "$ROOT" && grep -E '^\s+- [0-9]+px /recipes: P16 ' <<<"$OUT" | node scripts/lib/page-layout-modes.mjs count-fail scripts/check-page-layout.modes 2>/dev/null)"
[ "${COUNT:-0}" -gt 0 ] && ok || bad "the P16 findings on /recipes must count as failures (count-fail said '${COUNT:-}')"
# the new header is clean at every quick-profile width
for rule in P1 P13 P14 P16; do
  grep -Eq "^\s+- [0-9]+px /settings: ${rule} " <<<"$OUT" && bad "the new header (/settings) must have no ${rule} finding (got: $OUT)" || ok
done

printf 'page-layout-recipes-header_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
