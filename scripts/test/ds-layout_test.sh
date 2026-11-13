#!/usr/bin/env bash
# DS-A round 2: real-layout checks that jsdom cannot fake. Static fixture pages (scripts/test/fixtures/ds-layout) load the app's
# real stylesheets, measure themselves in headless Chrome and write the result as JSON into <title>; this reads it from --dump-dom.
#   action-group-narrow-row.html  round 3: a 358 px ListRow, the group on its own line, the title >= 120 px, no spill.
#   action-group.html   ActionGroup in a ListRow and a flex row (800 px): wide (flex), not 0 px wide, no overflow, at the row's
#                       end, the two groups of a list aligned in one column; in a 358 px tile: narrow (grid), no overflow.
#   metric-strip.html   a metric strip holds at most three tiles per row (system.md §4).
#   p12-*.html          the page-layout guard's nav probe (scripts/lib/page-layout-nav-probe.js, the driver's own): a box fully
#                       or partly under the bottom bar is a finding; with the clearance there is none (system.md §8).
# No Chrome: SKIP (exit 0), as the page-layout guard does in its quick profile.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FIX="$HERE/fixtures/ds-layout"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

CHROME_BIN="${CHROME:-$(command -v google-chrome || command -v chromium || true)}"
if [ -z "$CHROME_BIN" ] || ! command -v "$CHROME_BIN" >/dev/null 2>&1; then
  echo "SKIP: Chrome not found; set CHROME=/path/to/chrome to run ds-layout_test.sh"
  exit 0
fi
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE"' EXIT

# title_of PAGE -> the JSON the page wrote into its <title> (empty when Chrome or the page failed)
title_of() {
  timeout 60 "$CHROME_BIN" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" --allow-file-access-from-files \
    --window-size=1280,900 --virtual-time-budget=3000 --dump-dom "file://$FIX/$1" 2>/dev/null |
    sed -n 's:.*<title>\(.*\)</title>.*:\1:p' | head -1 | sed 's/&quot;/"/g; s/&amp;/\&/g'
}
# jq-free JSON reads through node
q() { node -e 'const o=JSON.parse(process.argv[1]); const v=Function("o","return "+process.argv[2])(o); console.log(typeof v==="object"?JSON.stringify(v):String(v))' "$1" "$2" 2>/dev/null; }

# --- ActionGroup ------------------------------------------------------------------------------------------------------
A="$(title_of action-group.html)"
[ -n "$A" ] && [ "$A" != pending ] && ok || bad "action-group.html did not report (title: '$A')"
for g in g1 g2 g3; do
  [ "$(q "$A" "o.$g.display")" = flex ] && ok || bad "ActionGroup $g in an 800 px row must be wide (display flex), got $(q "$A" "o.$g.display") ($A)"
  [ "$(q "$A" "o.$g.w > 200")" = true ] && ok || bad "ActionGroup $g must not collapse (width $(q "$A" "o.$g.w") px; the review saw 0)"
  [ "$(q "$A" "o.$g.overflow")" = false ] && ok || bad "ActionGroup $g: its buttons must not overflow the group ($(q "$A" "o.$g"))"
  [ "$(q "$A" "o.$g.oneLine")" = true ] && ok || bad "ActionGroup $g: wide, its buttons sit on one line"
  [ "$(q "$A" "o.$g.right <= o.$g.hostRight + 1 && o.$g.right >= o.$g.hostRight - 40")" = true ] && ok || bad "ActionGroup $g sits at its row's end ($(q "$A" "o.$g"))"
done
[ "$(q "$A" "Math.abs(o.g1.left - o.g2.left) <= 1")" = true ] && ok || bad "the groups of one list line up in one column (\"Cooked\" at $(q "$A" o.g1.left), \"All Cooked\" at $(q "$A" o.g2.left))"
[ "$(q "$A" "o.g4.display")" = grid ] && ok || bad "ActionGroup in a 358 px tile is narrow (display grid), got $(q "$A" o.g4.display)"
[ "$(q "$A" "o.g4.overflow")" = false ] && ok || bad "ActionGroup in a 358 px tile must not overflow ($(q "$A" o.g4))"
[ "$(q "$A" "o.g4.right <= o.g4.hostRight")" = true ] && ok || bad "ActionGroup in a 358 px tile stays inside it"

# --- round 3: a 358 px ListRow (a phone): below 35rem the group takes its own line, spanning the row ---------------------------
N="$(title_of action-group-narrow-row.html)"
[ -n "$N" ] && [ "$N" != pending ] && ok || bad "action-group-narrow-row.html did not report (title: '$N')"
[ "$(q "$N" "o.titleW >= 120")" = true ] && ok || bad "a long title in a 358 px ListRow keeps a readable width (>= 120 px), got $(q "$N" o.titleW) px"
[ "$(q "$N" "o.groupBelow")" = true ] && ok || bad "in a 358 px ListRow the ActionGroup takes its own line below the text ($N)"
[ "$(q "$N" "o.groupSpans")" = true ] && ok || bad "in a 358 px ListRow the ActionGroup spans the row ($N)"
[ "$(q "$N" "o.spill <= 0")" = true ] && ok || bad "nothing spills past a 358 px ListRow (\"All Cooked\" spilled 8 px in review 2), got $(q "$N" o.spill) px"
[ "$(q "$N" "o.display")" = grid ] && ok || bad "the narrow group is the equal-track grid, got $(q "$N" o.display)"

# --- metric strip -----------------------------------------------------------------------------------------------------
M="$(title_of metric-strip.html)"
[ -n "$M" ] && [ "$M" != pending ] && ok || bad "metric-strip.html did not report (title: '$M')"
[ "$(q "$M" o.wideFirstRow)" = 3 ] && ok || bad "a metric strip of 5 in 1100 px holds 3 tiles in its first row, got $(q "$M" o.wideFirstRow)"
[ "$(q "$M" o.threeFirstRow)" = 3 ] && ok || bad "a metric strip of 3 is one row, got $(q "$M" o.threeFirstRow)"

# --- P12: the driver's nav probe --------------------------------------------------------------------------------------
[ -f "$ROOT/scripts/lib/page-layout-nav-probe.js" ] && ok || bad "scripts/lib/page-layout-nav-probe.js (the P12 probe, defining feederNavProbe) is missing"
grep -q 'page-layout-nav-probe.js' "$ROOT/scripts/check-page-layout.mjs" && ok || bad "check-page-layout.mjs must evaluate scripts/lib/page-layout-nav-probe.js (one probe, tested here)"
P="$(title_of p12-covered.html)"
[ "$(q "$P" "Array.isArray(o) && o.some((f) => /^button\.last/.test(f.sel) && f.px > 0)")" = true ] && ok || bad "a button entirely under the bottom bar must be a P12 finding (probe said: $P)"
P="$(title_of p12-partial.html)"
[ "$(q "$P" "Array.isArray(o) && o.some((f) => /^button\.last/.test(f.sel))")" = true ] && ok || bad "a button partly under the bottom bar must be a P12 finding (probe said: $P)"
P="$(title_of p12-clear.html)"
[ "$P" = "[]" ] && ok || bad "with the clearance nothing is under the bar: the probe must return [] (said: $P)"

# round 3: a 1 px tolerance (subpixel rounding at the bar's edge reported "0 px" on /recipes/new, /recipes/1/edit, /recipes/1)
P="$(title_of p12-half-px.html)"
[ "$P" = "[]" ] && ok || bad "a 0.5 px intersection with the bar is not a P12 finding (probe said: $P)"
P="$(title_of p12-two-px.html)"
[ "$(q "$P" "Array.isArray(o) && o.some((f) => /^div\.last/.test(f.sel) && f.px >= 2)")" = true ] && ok || bad "a 2 px intersection with the bar is a P12 finding of 2 px (probe said: $P)"
P="$(title_of p12-covered.html)"
[ "$(q "$P" "Array.isArray(o) && o.every((f) => f.px > 1)")" = true ] && ok || bad "the probe never reports an intersection of 1 px or less ('0 px' in review 2): $P"

printf 'ds-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
