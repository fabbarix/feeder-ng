#!/usr/bin/env bash
# ds-plan round 3: rule P14 of the page-layout guard. A chip whose label is cut by an ellipsis while its chip line still has room to
# spare is a finding (the Plan review: "Leftover from Sat" shown as "L…", alone on a 1024 px row, because the chip line was only as
# wide as its content and `max-inline-size: 40%` was a percentage of that). A chip cut because the line is really full is fine.
# The real driver runs against a tiny static server (fixtures/page-layout-chips): /plan is a lone chip cut by a 40 % cap on a
# content-sized line (clipped.html); /settings is the fixed rule: a lone chip in full, and a really full line whose last chip is cut
# (roomy.html). No Chrome: SKIP.
set -uo pipefail
for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FIX="$HERE/fixtures/page-layout-chips"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
TMP="$(mktemp -d)"
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"
if [ -z "$CHROME_BIN" ]; then
  echo "SKIP: Chrome not found; page-layout-chips_test.sh did not run"
  exit 0
fi

PORT=$((40000 + $(printf '%s' "$ROOT$$" | cksum | cut -d' ' -f1) % 9000))
cat >"$TMP/server.cjs" <<'JS'
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.env.FIX
http.createServer((q, s) => {
  if (q.url.startsWith('/api/')) { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.setHeader('content-type', 'text/html')
  s.end(fs.readFileSync(path.join(dir, q.url.startsWith('/settings') ? 'roomy.html' : 'clipped.html')))
}).listen(Number(process.env.PORT), '127.0.0.1')
JS
FIX="$FIX" PORT="$PORT" node "$TMP/server.cjs" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
echo '{"recipeId":1,"ingredientId":1,"productId":1,"shopId":1}' >"$TMP/ids.json"
OUT="$(cd "$ROOT" && CHROME="$CHROME_BIN" PAGE_LAYOUT_ONLY='^/(plan|settings)$' timeout 180 node scripts/check-page-layout.mjs --url "http://127.0.0.1:$PORT" --ids "$TMP/ids.json" 2>&1)"

# the lone chip cut by the 40 % cap, at a tablet and a desktop width and on a phone
for w in 390 834 1024 1440; do
  grep -Eq "^\s+- ${w}px /plan: P14 .*Leftover from Sat" <<<"$OUT" && ok || bad "${w}px /plan: a lone chip cut with room to spare must be a P14 finding naming its label (got: $OUT)"
done
# the fixed rule, and a line that is really full, are clean
grep -Eq '^\s+- [0-9]+px /settings: P14 ' <<<"$OUT" && bad "/settings (a lone chip in full, and a really full line) must have no P14 finding (got: $OUT)" || ok

printf 'page-layout-chips_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
