#!/usr/bin/env bash
# DS-A round 2: real-layout checks that jsdom cannot fake. Static fixture pages (scripts/test/fixtures/ds-layout) load the app's
# real stylesheets, measure themselves in headless Chrome and write the result as JSON into <title>; this reads it from --dump-dom.
#   action-group-narrow-row.html  round 3: a 358 px ListRow, the group on its own line, the title >= 120 px, no spill.
#   action-group.html   ActionGroup in a ListRow and a flex row (800 px): wide (flex), not 0 px wide, no overflow, at the row's
#                       end, the two groups of a list aligned in one column; in a 358 px tile: narrow (grid), no overflow.
#   metric-strip.html   a metric strip holds at most three tiles per row (system.md §4).
#   p12-*.html          the page-layout guard's nav probe (scripts/lib/page-layout-nav-probe.js, the driver's own): a box fully
#                       or partly under the bottom bar is a finding; with the clearance there is none (system.md §8).
#   today-*.html        DS-TODAY round 2: To confirm rows (wide and 358 px: actions not collapsed, no clipped label, no overlap, own row on a
#                       phone), the hero's Course row and slot menu, the metric strip.
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

# --- DS-TODAY round 2: To confirm rows, the hero's Course row, the metric strip ---------------------------------------------
T="$(title_of today-confirm.html)"
[ -n "$T" ] && [ "$T" != pending ] && ok || bad "today-confirm.html did not report (title: '$T')"
for r in 0 1; do
  [ "$(q "$T" "o.wide[$r].gw > 200")" = true ] && ok || bad "To confirm row $r, 1000 px: the actions must not collapse (the review saw 0 px; width $(q "$T" "o.wide[$r].gw"))"
  [ "$(q "$T" "o.wide[$r].clipped")" = false ] && ok || bad "To confirm row $r, 1000 px: a button is narrower than its label (button.scrollWidth > clientWidth)"
  [ "$(q "$T" "o.wide[$r].overlap")" = false ] && ok || bad "To confirm row $r, 1000 px: the text overlaps the actions"
  [ "$(q "$T" "o.wide[$r].gr <= o.wide[$r].rr + 1 && o.wide[$r].gl > o.wide[$r].tr - 1")" = true ] && ok || bad "To confirm row $r, 1000 px: the group is at the row's end, after the text"
  [ "$(q "$T" "o.narrow[$r].clipped")" = false ] && ok || bad "To confirm row $r, 358 px: a button is narrower than its label"
  [ "$(q "$T" "o.narrow[$r].overlap")" = false ] && ok || bad "To confirm row $r, 358 px: the text overlaps the actions"
  [ "$(q "$T" "o.narrow[$r].gt >= o.narrow[$r].tb - 1")" = true ] && ok || bad "To confirm row $r, 358 px: the group is on its own row, under the text (today-A-390)"
  [ "$(q "$T" "Math.abs(o.narrow[$r].gl - o.narrow[$r].rl) <= 2 && Math.abs(o.narrow[$r].gr - o.narrow[$r].rr) <= 2")" = true ] && ok || bad "To confirm row $r, 358 px: the group spans the row's full width"
done
[ "$(q "$T" "o.wide[0].gl === o.wide[1].gl || Math.abs(o.wide[0].gr - o.wide[1].gr) <= 1")" = true ] && ok || bad "To confirm, 1000 px: the groups of the rows share one column (right edges equal)"

H="$(title_of today-hero.html)"
[ -n "$H" ] && [ "$H" != pending ] && ok || bad "today-hero.html did not report (title: '$H')"
for w in wide narrow; do
  [ "$(q "$H" "o.$w.menuRightInset === o.$w.pad")" = true ] && ok || bad "hero $w: the slot ⋮ is inset by the tile padding from the end, aligned with the content (inset $(q "$H" o.$w.menuRightInset), padding $(q "$H" o.$w.pad))"
  [ "$(q "$H" "o.$w.nameClipped")" = false ] && ok || bad "hero $w: the Recipe name of the Course row is never cut by an ellipsis"
  [ "$(q "$H" "o.$w.equal")" = true ] && ok || bad "hero $w: Swap, Pin and ⋮ are one evenly sized group ($(q "$H" o.$w.actionW))"
  [ "$(q "$H" "o.$w.actRight <= o.$w.rowRight + 1")" = true ] && ok || bad "hero $w: the icon group stays inside its row"
done
[ "$(q "$H" o.wide.chipBesideName)" = true ] && ok || bad "hero, 960 px: the Leftover chip sits beside the Course name (today-A-1024)"
[ "$(q "$H" o.wide.capColumn)" = true ] && ok || bad "hero, 960 px: the SIDE caption is its own column before the name"
[ "$(q "$H" "o.wide.divider >= 1")" = true ] && ok || bad "hero: a divider separates the Course rows from the title block"
[ "$(q "$H" o.narrow.chipUnderName)" = true ] && ok || bad "hero, 358 px: the chip drops under the name (today-A-390)"

K="$(title_of today-metrics.html)"
[ -n "$K" ] && [ "$K" != pending ] && ok || bad "today-metrics.html did not report (title: '$K')"
[ "$(q "$K" "o.loneW <= 1000 / 3 + 1")" = true ] && ok || bad "a lone metric is capped to the metric track, not a full-width block (width $(q "$K" o.loneW) in 1000 px)"
[ "$(q "$K" "Math.abs(o.loneW - o.twoW) <= 2")" = true ] && ok || bad "a lone metric is as wide as one of two (lone $(q "$K" o.loneW), of two $(q "$K" o.twoW))"
[ "$(q "$K" o.iconTopRight)" = true ] && ok || bad "the metric icon sits top-right of its tile (mockup)"
# round 3: a 1 px tolerance (subpixel rounding at the bar's edge reported "0 px" on /recipes/new, /recipes/1/edit, /recipes/1)
P="$(title_of p12-half-px.html)"
[ "$P" = "[]" ] && ok || bad "a 0.5 px intersection with the bar is not a P12 finding (probe said: $P)"
P="$(title_of p12-two-px.html)"
[ "$(q "$P" "Array.isArray(o) && o.some((f) => /^div\.last/.test(f.sel) && f.px >= 2)")" = true ] && ok || bad "a 2 px intersection with the bar is a P12 finding of 2 px (probe said: $P)"
P="$(title_of p12-covered.html)"
[ "$(q "$P" "Array.isArray(o) && o.every((f) => f.px > 1)")" = true ] && ok || bad "the probe never reports an intersection of 1 px or less ('0 px' in review 2): $P"

printf 'ds-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
