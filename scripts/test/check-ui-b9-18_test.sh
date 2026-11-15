#!/usr/bin/env bash
# B9-18 (SAFE R1; plan section 9, check-ui rule 23): the `danger-sheet` rule.
#   danger-sheet  23  a <Dialog> or <BottomSheet> with tone="danger" or icon="delete": a danger confirm built outside ConfirmDialog
#                     (use useConfirm / <ConfirmDialog tone="danger">: safe button focused, outline Cancel, rows, no Close)
# Counting unit, which the fixtures fix: one violation per offending <Dialog>/<BottomSheet> element (its opening tag may span lines). The primitives
# themselves (ui/ConfirmDialog.tsx, ui/Dialog.tsx, ui/BottomSheet.tsx) and the showcase (ui/Gallery*.tsx) are exempt. Comments do not count.
# The rule is a drop-in: scripts/check-ui.d/danger-sheet.sh. Mode: scripts/check-ui.rules.d/b9-18.rules. The committed tree has danger Dialogs outside
# ConfirmDialog in features/ (CourseRemoveDialog, CourseLossDialog, ScanScreen) until their packages move them, so the mode is warn with
# fail_paths for the folders that are clean (web/src/ui and web/src/app); each feature package adds its own folder when it has converted.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
FIX="$HERE/fixtures/check-ui"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow"

OLD=(native-ui phosphor colour-literals class-hooks sizing glossary native-search back-link image-input type-scale opacity-muting word-break button-variant close-button sheet-cancel bullet-notice raw-radius raw-spacing media-width focus-ring scheme-attr)
NEW=(danger-sheet)
EXPECT=3

run_ui() { # ROOT RULES_FILE -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # mode [extra line]
  local f="$TMP/rules-$1-$RANDOM" r
  : >"$f"
  for r in "${OLD[@]}"; do echo "$r=warn" >>"$f"; done
  echo "danger-sheet=$1" >>"$f"
  [ -n "${2:-}" ] && echo "$2" >>"$f"
  echo "$f"
}

r=danger-sheet
run_ui "$FIX/$r/pass" "$(rules_file fail)"
[ "$RC" -eq 0 ] && ok || bad "$r: pass fixture must exit 0 in fail mode (got $RC): $(head -c 400 <<<"$OUTPUT")"
[ "$(count_of "$r")" = 0 ] && ok || bad "$r: pass fixture must report 0 violations (got '$(count_of "$r")'): $(grep -E "^$r" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"

run_ui "$FIX/$r/fail" "$(rules_file fail)"
[ "$RC" -eq 1 ] && ok || bad "$r: fail fixture must exit 1 in fail mode (got $RC)"
[ "$(count_of "$r")" = "$EXPECT" ] && ok || bad "$r: fail fixture must report $EXPECT violations (got '$(count_of "$r")'): $(grep -E "^$r" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
grep -q "^$r" "$TMP/out.txt" 2>/dev/null && ok || bad "$r: violations must be written to the CHECK_UI_OUT file"
# one per element, on the line of its opening tag: lines 8, 11 and 19 of the fixture
for line in 8 11 19; do
  grep -E "^$r"$'\t'".*A\.tsx"$'\t'"$line"$'\t' "$TMP/out.txt" >/dev/null 2>&1 && ok || bad "$r: must report the element opened on line $line of A.tsx"
done

run_ui "$FIX/$r/fail" "$(rules_file warn)"
[ "$RC" -eq 0 ] && ok || bad "$r: warn mode must never fail (got $RC)"
[ "$(count_of "$r")" = "$EXPECT" ] && ok || bad "$r: warn mode must count the same violations"

run_ui "$FIX/$r/fail" "$(rules_file warn "$r.fail_paths=web/src/features/x")"
[ "$RC" -eq 1 ] && ok || bad "$r: fail_paths covering the violations must exit 1 (got $RC)"
run_ui "$FIX/$r/fail" "$(rules_file warn "$r.fail_paths=web/src/ui")"
[ "$RC" -eq 0 ] && ok || bad "$r: fail_paths elsewhere must not fail (got $RC)"

run_ui "$FIX/$r/fail" "$(rules_file warn)"
grep -q 'ConfirmDialog' "$TMP/out.txt" && ok || bad "$r: the message must point to ConfirmDialog / useConfirm"

# --- the committed rule: a drop-in with a mode line that fails in the folders that are clean
grep -qs "^register_rule $r\$" "$SCRIPTS/check-ui.d/$r.sh" && ok || bad "scripts/check-ui.d/$r.sh must register $r"
grep -Eqs "^$r=(warn|fail)\$" "$SCRIPTS/check-ui.rules.d/b9-18.rules" && ok || bad "check-ui.rules.d/b9-18.rules must set a mode for $r"
for folder in web/src/ui web/src/app; do
  grep -Eqs "^$r\.fail_paths=$folder\$" "$SCRIPTS/check-ui.rules.d/b9-18.rules" && ok || bad "check-ui.rules.d/b9-18.rules must fail $r under $folder (clean today)"
done

printf 'check-ui-b9-18: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
