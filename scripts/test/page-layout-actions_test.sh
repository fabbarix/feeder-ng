#!/usr/bin/env bash
# check-profile: browser (starts Chrome; CHECK_PROFILE=ci leaves it out, the full check runs it)
# B9-01 (DS-12 R-A, plan section 9): page-layout rules P29 and P30.
#   P29  an action in a tile, toast, sheet footer, dialog or banner whose boundary is under 3:1 against what it sits on
#   P30  a Segmented option on two lines (and a [data-one-line] button): a segmented option is always one line
# Both are always-fail rules. The real driver runs against a tiny static server (fixtures/page-layout-actions): /plan is the
# failing page (about 1.5:1 boundaries, a wrapping Segmented option), /settings the clean one. No Chrome: SKIP.
# Written before the rules exist: it fails until the Developer adds scripts/lib/page-layout/rules/P29-*.mjs and P30-*.mjs
# (or, before the guard split is merged, the rules in page-layout-rules.mjs) and their probes.
set -uo pipefail
for v in $(compgen -e | grep -E '^PAGE_LAYOUT'); do unset "$v"; done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FIX="$HERE/fixtures/page-layout-actions"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
TMP="$(mktemp -d)"
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

# static: P29 and P30 are always-fail rules, registered with their owner
RULES="$ROOT/scripts/lib/page-layout-rules.mjs"
REG="$(cat "$RULES" "$ROOT"/scripts/lib/page-layout/*.mjs "$ROOT"/scripts/lib/page-layout/rules/*.mjs 2>/dev/null)"
grep -Eq "ALWAYS_FAIL *=.*'P29'" <<<"$REG" && ok || bad "ALWAYS_FAIL must list P29"
grep -Eq "ALWAYS_FAIL *=.*'P30'" <<<"$REG" && ok || bad "ALWAYS_FAIL must list P30"

CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"
if [ -z "$CHROME_BIN" ]; then
  echo "SKIP: Chrome not found; the browser part of page-layout-actions_test.sh did not run"
  printf 'page-layout-actions_test: %d passed, %d failed\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]
  exit $?
fi

PORT=$((40000 + $(printf '%s' "$ROOT$$" | cksum | cut -d' ' -f1) % 9000))
cat >"$TMP/server.cjs" <<'JS'
const http = require('http'), fs = require('fs'), path = require('path')
const dir = process.env.FIX
http.createServer((q, s) => {
  if (q.url.startsWith('/api/')) { s.setHeader('content-type', 'application/json'); return s.end('{}') }
  s.setHeader('content-type', 'text/html')
  s.end(fs.readFileSync(path.join(dir, q.url.startsWith('/settings') ? 'ok.html' : 'low.html')))
}).listen(Number(process.env.PORT), '127.0.0.1')
JS
FIX="$FIX" PORT="$PORT" node "$TMP/server.cjs" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 1 25); do curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" && break; sleep 0.2; done
echo '{"recipeId":1,"ingredientId":1,"productId":1,"shopId":1}' >"$TMP/ids.json"
OUT="$(cd "$ROOT" && CHROME="$CHROME_BIN" PAGE_LAYOUT_ONLY='^/(plan|settings)$' timeout 180 node scripts/check-page-layout.mjs --url "http://127.0.0.1:$PORT" --ids "$TMP/ids.json" 2>&1)"

for w in 390 1440; do
  # P29: each of the four surfaces (tile, toast, sheet footer, dialog) reports its weak action, and names its label
  for label in Dismiss Review Cancel "Keep it"; do
    grep -Eq "^\s+- ${w}px /plan: P29 .*${label}" <<<"$OUT" && ok || bad "${w}px /plan: a ~1.5:1 '${label}' boundary must be a P29 finding naming its label (got: $OUT)"
  done
  grep -Eq "^\s+- ${w}px /plan: P30 .*(Every other day|Weekly on Monday)" <<<"$OUT" && ok || bad "${w}px /plan: a Segmented option on two lines must be a P30 finding naming its label (got: $OUT)"
done
grep -Eq '^\s+- [0-9]+px /settings: P(29|30) ' <<<"$OUT" && bad "/settings (4.5:1 boundaries, one-line options) must have no P29 or P30 finding (got: $OUT)" || ok

printf 'page-layout-actions_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
