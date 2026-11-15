#!/usr/bin/env bash
# R2-L: scripts/check-shell-layout.mjs covers the wide screens and the rail contrast (L-04, P7). Source-level checks: the script needs Chrome.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
F="${SHELL_LAYOUT_F:-$ROOT/scripts/check-shell-layout.mjs}"  # SHELL_LAYOUT_F: the guard to read (a test of this test)
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$1" "$F" && ok || bad "$2"; }

has "width: 1920, height: 1080" "VIEWPORTS must include 1920x1080"
has "width: 2560, height: 1440" "VIEWPORTS must include 2560x1440"
has "railContrast" "the probe must compute the current rail item's contrast (rule 11)"
has "4\\.5" "rule 11 must require a contrast of at least 4.5"
has "[Cc]ontrast.*(aria-current|current)" "rule 11 must target the current rail item"
has "^//  11\\." "the header comment must document rule 11"
has "'/scan'" "rule 11 needs /scan in ROUTES (the accent item that was unreadable)"
# the min(1100, ...) cap is gone from rule 9: <main> is the grid column now (R2-L)
grep -Eq "Math\\.min\\(1100" "$F" && bad "rule 9 must not cap <main> at 1100 any more (the cap moved to ui/Page)" || ok
# PN: six bottom-bar buttons (Today, Plan, Pantry | Scan | Shop, Recipes) on the narrowest phones
# B9-19 (amendment A1, the user's rule: no guard viewport of any kind is narrower than 375 px): the narrowest phone is 375x800, icons only.
has "width: 375, height: 800" "VIEWPORTS must include 375x800 (the narrowest phone the bar must fit)"
grep -Eq "width: ([0-9]|[0-9]{2}|[12][0-9]{2}|3[0-6][0-9]|37[0-4])," "$F" && bad "no VIEWPORTS entry may be narrower than 375 px (A1)" || ok
grep -Eq "\\b360\\b" "$F" && bad "no 360 may remain in check-shell-layout.mjs: rules 13 to 15 measure the bar at 375 (A1)" || ok
has "width: 430, height: 932" "VIEWPORTS must include 430x932"
has "'/pantry'" "ROUTES must include /pantry (the Pantry tab must be current there)"
has "^//  12\\." "the header comment must document rule 12 (the six-button bar)"
has "[Ss]can.*centre|centre.*[Ss]can|centred" "rule 12 must check that Scan is centred in the bar"
has ">= 44|at least 44" "rule 12 must require a 44 px target for every bar button"
has "bottom-bar__label.*scrollWidth|scrollWidth.*bottom-bar__label|barLabel" "rule 12 must check that no bar label is truncated (scrollWidth <= clientWidth)"
has "safe-area|safeArea" "rule 12 must mention the safe-area insets"
grep -Eq "ROUTES = \[[^]]*'/stock'" "$F" && bad "ROUTES must not list /stock as a page any more (it redirects); a separate redirect check may name it" || ok
# FU-1: a toast never covers the sticky action bar on phones
has "^//  14\\." "the header comment must document rule 14 (toast vs sticky action bar)"
has "toast-region" "rule 14 must measure the .toast-region"
has "toast-region.*sticky-action-bar|sticky-action-bar.*toast-region|toastProbe" "rule 14 must compare the toast region with the sticky action bar"
# nav-even: seven equal slots, Scan centred, Settings top-level; 1024 is a checked width
has "width: 1024, height: 768" "VIEWPORTS must include 1024 (the rail's first width)"
has "^//  15\\." "the header comment must document rule 15 (the seven-slot bar)"
has "expected 7" "the bar must have seven buttons (Settings is top-level), rule 12 and rule 15"
has "navProbe" "rule 15 must have its own probe"
has "slots are uneven|not the .* of the first|equal" "rule 15 must check that every slot has the same width"
has "Scan is not centred \\(centre" "rule 15 must check that Scan's centre is the bar's centre"
has "active pill.*(gap|edge)|inset" "rule 15 must check the active pill inset against the gap between items"
has "less than the .*gap between items" "rule 15 must fail when the pill inset is smaller than the gap"
has "wraps onto more than one line|clipped" "rule 15 must check that no label is clipped or wrapped"
has "setEmulatedMedia" "rule 15 must run in light and dark (prefers-color-scheme)"
has "\\[375, 390, 820, 1024, 1280\\]" "rule 15 must cover 375, 390, 820, 1024 and 1280"
has "icons only|iconsOnly|icons-only" "rule 15 must accept the icons-only bar at 375 px (the labels are visually hidden there, A1)"
has "bottom-bar__icon" "rules 12 and 15 must measure the 40 px squircle (.bottom-bar__icon) of the current page and Scan inside the bar (R-F)"
has "at 375 and 390 px" "rules 13 and 14 must say they measure at 375 and 390 px"
# Hotfix 4.2: the photo editor's crop handles sit on the crop box (rule 16), measured on the dev-only fixture route
has "^//  16\\." "the header comment must document rule 16 (crop handles)"
has "/_editor-fixture" "rule 16 must open the dev-only editor fixture route"
has "width of \\[390, 412\\]|\\[390, 412\\]" "rule 16 must run at 390 and 412 px"
has "crop-editor__handle" "rule 16 must measure the .crop-editor__handle buttons"
has "> 3" "rule 16 must allow at most 3 px between a handle and its place on the crop box"
has "crop-editor__readout|data-fixture-below|overlaps" "rule 16 must check that no handle sits on the controls below the editor"
grep -q "_editor-fixture" "$ROOT/web/src/main.tsx" && grep -q "import.meta.env.DEV" "$ROOT/web/src/main.tsx" && ok || bad "main.tsx must register /_editor-fixture only under import.meta.env.DEV"
grep -Eq "^\\s*import .*EditorFixture|from '\\./dev/EditorFixture'" "$ROOT/web/src/main.tsx" && bad "main.tsx must load the fixture lazily (dynamic import), never statically" || ok
# B9-19 review: pages are awaited by a condition with a generous cap, never a fixed wait after a navigation (a loaded machine
# rendered pages later than the old fixed 1.5 s waits, and the rules measured an empty frame)
has "LOAD_CAP_MS" "the page load must be capped by LOAD_CAP_MS"
has "async function load\\(" "a load() helper must wait for the page to render"
has "nav\\.bottom-bar, nav\\.side-rail" "load() must wait for the shell's navigation"
has "__shellLayoutPrevious" "load() must not take the previous document for the new one"
grep -Eq "Page\.navigate.*\}\)\s*$" "$F" && grep -A1 "Page.navigate" "$F" | grep -Eq "setTimeout\(r, [0-9]{4}\)" && bad "no fixed multi-second wait may follow a navigation; use load()" || ok
has "did not render within" "a page that never renders must be a failure, not a silent pass"
has "process.on\\('exit', \\(\\) => chrome.kill\\(\\)\\)" "Chrome must be stopped on every exit path"
# USER (w2c): keyboard focus rings the bar's 40 px squircle only, the current Scan gets an outline; rule 15 measures both
has "ringProbe" "rule 15 must measure the focus rings and the current Scan outline (USER w2c)"
has "\\[375, 376, 390, 430\\]" "the rings are measured at 375, 376, 390 and 430"
has "rings the link; the ring is on the squircle only" "a ring round the whole link must fail"
has "the current Scan's squircle has no outline" "a current Scan without its outline must fail"
has "from the label .*less than 1.5" "a ring touching a label must fail"
has "from the current Scan outline, less than 1.5" "a focus ring touching the current Scan's outline must fail"
has "inside the bar's inner outline, less than 2" "a ring touching the bar border must fail"
node --check "$F" 2>/dev/null && ok || bad "check-shell-layout.mjs must be valid"
# int1: the in-page probes are template literals, so a single backslash in a regex is lost (the ring probe threw a SyntaxError in Chrome,
# which read as "no bottom bar"). Each probe, as the page receives it, must parse.
node -e '
const src = require("fs").readFileSync(process.argv[1], "utf8")
const names = [...src.matchAll(/^const (\w+Probe) = `/gm)].map((m) => m[1])
if (!names.length) { console.error("no probes found"); process.exit(1) }
const vm = require("vm")
for (const n of names) {
  const text = vm.runInNewContext(src.match(new RegExp("^const " + n + " = (`[\\s\\S]*?`)\\n", "m"))[1].replace(/\$\{[^}]*\}/g, "0"))
  try { new Function("return " + text) } catch (e) { console.error(n + ": " + e.message); process.exit(1) }
}' "$F" && ok || bad "every in-page probe must parse as the page receives it (a regex backslash in a template literal is written doubled)"
# B9-49: the labelled bar gives its end label room (a smaller end radius in the 376 px to 37.5em band), so the guard asks for 8 px from the
# rounded end again (int1 had relaxed it to 3 px as a call for the main session to confirm or revert; the call is closed).
has "rounded end, less than 8" "an end label inside 8 px of the bar's rounded end must fail (B9-49 restores the 8 px int1 relaxed)"
grep -Eq "rounded end, less than 3|labelEdgeRoom < 3 " "$F" && bad "the 3 px rounded-end allowance must be gone: an end label keeps 8 px from the curve (B9-49)" || ok
has "labelEdgeRoom < 8 - 0\\.5" "the rounded-end check must use the same 8 px (with the half-pixel tolerance) as the straight-edge check"

printf 'check-shell-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
