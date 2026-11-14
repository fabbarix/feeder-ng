#!/usr/bin/env bash
# B9-01 (DS-12; plan section 9, check-ui rules 13 to 16): four new check-ui rules.
#   button-variant  13  variant="tertiary" | "danger-tertiary" | "accent-secondary" (use secondary, danger-secondary, link)
#   close-button    14  <IconButton icon="close"> outside CloseButton, Toast and Chip (use <CloseButton>)
#   sheet-cancel    15  a BottomSheet or Dialog whose footer / actions pass their own {uiStrings.cancel} Button (use onCancel)
#   bullet-notice   16  a hand-written <ul>/<li> in a file that renders a Tile, Notice, Toast or Dialog, outside ui/DetailList (use DetailList)
# Counting units, which the fixtures fix: one violation per offending JSX attribute / element for rules 13 to 15, one per file for 16.
# Each fails everywhere (the sweep cleans every feature folder), so the committed check-ui.rules sets each to fail, with no fail_paths.
# Written before the rules exist: it fails until the Developer adds scripts/check-ui.d/{button-variant,close-button,sheet-cancel,bullet-notice}.*
# (or the rules in check-ui.sh before the guard split is merged) and the sweep.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
FIX="$HERE/fixtures/check-ui"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow"

OLD=(native-ui phosphor colour-literals class-hooks sizing glossary native-search back-link image-input type-scale opacity-muting word-break)
NEW=(button-variant close-button sheet-cancel bullet-notice)
declare -A EXPECT=([button-variant]=3 [close-button]=2 [sheet-cancel]=2 [bullet-notice]=3)

run_ui() { # ROOT RULES_FILE -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # rule mode [extra line]
  local f="$TMP/rules-$1-$2-$RANDOM" r
  : >"$f"
  for r in "${OLD[@]}" "${NEW[@]}"; do
    if [ "$r" = "$1" ]; then echo "$r=$2" >>"$f"; else echo "$r=warn" >>"$f"; fi
  done
  [ -n "${3:-}" ] && echo "$3" >>"$f"
  echo "$f"
}

for r in "${NEW[@]}"; do
  run_ui "$FIX/$r/pass" "$(rules_file "$r" fail)"
  [ "$RC" -eq 0 ] && ok || bad "$r: pass fixture must exit 0 in fail mode (got $RC): $(head -c 400 <<<"$OUTPUT")"
  [ "$(count_of "$r")" = 0 ] && ok || bad "$r: pass fixture must report 0 violations (got '$(count_of "$r")')"

  run_ui "$FIX/$r/fail" "$(rules_file "$r" fail)"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail fixture must exit 1 in fail mode (got $RC)"
  [ "$(count_of "$r")" = "${EXPECT[$r]}" ] && ok || bad "$r: fail fixture must report ${EXPECT[$r]} violations (got '$(count_of "$r")')"
  grep -q "$r" "$TMP/out.txt" 2>/dev/null && ok || bad "$r: violations must be written to the CHECK_UI_OUT file"

  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn)"
  [ "$RC" -eq 0 ] && ok || bad "$r: warn mode must never fail (got $RC)"
  [ "$(count_of "$r")" = "${EXPECT[$r]}" ] && ok || bad "$r: warn mode must count the same violations"

  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/features/x")"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail_paths covering the violations must exit 1 (got $RC)"
  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/ui")"
  [ "$RC" -eq 0 ] && ok || bad "$r: fail_paths elsewhere must not fail (got $RC)"
done

# --- messages name the fix
run_ui "$FIX/button-variant/fail" "$(rules_file button-variant warn)"
grep -q 'secondary' "$TMP/out.txt" && ok || bad "button-variant: the message must point to secondary / danger-secondary / link"
run_ui "$FIX/close-button/fail" "$(rules_file close-button warn)"
grep -q 'CloseButton' "$TMP/out.txt" && ok || bad "close-button: the message must point to CloseButton"
run_ui "$FIX/sheet-cancel/fail" "$(rules_file sheet-cancel warn)"
grep -q 'onCancel' "$TMP/out.txt" && ok || bad "sheet-cancel: the message must point to onCancel"
run_ui "$FIX/bullet-notice/fail" "$(rules_file bullet-notice warn)"
grep -q 'use DetailList for items with a key, a state and detail' "$TMP/out.txt" && ok || bad "bullet-notice: the message must read 'use DetailList for items with a key, a state and detail'"
for f in NoticeTile ChangedToast AwayDialog; do grep -q "$f" "$TMP/out.txt" && ok || bad "bullet-notice: the report must name $f.tsx"; done

# --- the committed rules file: all four fail everywhere (the sweep cleans every folder), so no fail_paths
for r in "${NEW[@]}"; do
  grep -Eq "^$r=fail\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set $r=fail"
  grep -Eq "^$r\.fail_paths=" "$SCRIPTS/check-ui.rules" && bad "check-ui.rules: $r fails everywhere, it takes no fail_paths" || ok
done

# --- the real tree passes the committed rules (the sweep is done: no tertiary variant, no own Cancel, no bullet notice)
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC); first: $(grep -E 'button-variant|close-button|sheet-cancel|bullet-notice' "$TMP/real.txt" 2>/dev/null | head -3 | tr '\n' ' ')"

printf 'check-ui-actions_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
