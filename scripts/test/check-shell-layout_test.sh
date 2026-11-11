#!/usr/bin/env bash
# R2-L: scripts/check-shell-layout.mjs covers the wide screens and the rail contrast (L-04, P7). Source-level checks: the script needs Chrome.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
F="$ROOT/scripts/check-shell-layout.mjs"
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
node --check "$F" 2>/dev/null && ok || bad "check-shell-layout.mjs must be valid"

printf 'check-shell-layout_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
