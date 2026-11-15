#!/usr/bin/env bash
# B9-31 (SAFE-06; plan section 9, check-ui rule 25): the `no-history-back` rule.
#   no-history-back  25  navigate(-1), history.back() or history.go(-1) used to leave a screen: after a reload, a PWA launch or a shared link
#                        there is no in-app history, so a Cancel built on it closes Feeder (and it bypasses the leave guard).
# Counting unit, which the fixtures fix: one violation per call (four in the fail fixture: navigate(-1), window.history.back(),
# history.back(), history.go(-1)). Comments and JSX comments do not count. A line that also reads `location.key` is a back that only runs
# when the app has history to go back to (features/plan/hooks/useMarkSlotRoute.ts), and is allowed. navigate(1) is not a back.
# The rule is a drop-in: scripts/check-ui.d/no-history-back.sh. Mode: scripts/check-ui.rules.d/b9-31.rules. fail everywhere: the real tree is
# clean once the Recipe editor's Cancel goes to editorExitRoute.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
FIX="$HERE/fixtures/check-ui/no-history-back"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow"
R=no-history-back

run_ui() { # ROOT RULES_FILE -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # mode [extra line]
  local f="$TMP/rules-$1-$RANDOM"
  echo "$R=$1" >"$f"
  [ -n "${2:-}" ] && echo "$2" >>"$f"
  echo "$f"
}

run_ui "$FIX/pass" "$(rules_file fail)"
[ "$RC" -eq 0 ] && ok || bad "$R: pass fixture must exit 0 in fail mode (got $RC): $(head -c 400 <<<"$OUTPUT")"
[ "$(count_of $R)" = 0 ] && ok || bad "$R: pass fixture must report 0 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | head -3 | tr '\n' ' ')"

run_ui "$FIX/fail" "$(rules_file fail)"
[ "$RC" -eq 1 ] && ok || bad "$R: fail fixture must exit 1 in fail mode (got $RC)"
[ "$(count_of $R)" = 4 ] && ok || bad "$R: fail fixture must report 4 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
grep -q "^$R" "$TMP/out.txt" 2>/dev/null && ok || bad "$R: violations must be written to the CHECK_UI_OUT file"
# on the line of each call: 9, 10, 11 and 12 of Editor.tsx
for line in 9 10 11 12; do
  grep -E "^$R"$'\t'".*Editor\.tsx"$'\t'"$line"$'\t' "$TMP/out.txt" >/dev/null 2>&1 && ok || bad "$R: must report the call on line $line of Editor.tsx"
done
run_ui "$FIX/fail" "$(rules_file warn)"
grep -Eq 'replace|editorExitRoute|known route' "$TMP/out.txt" 2>/dev/null && ok || bad "$R: the message must say to navigate to a known route with replace"
[ "$RC" -eq 0 ] && ok || bad "$R: warn mode must never fail (got $RC)"
[ "$(count_of $R)" = 4 ] && ok || bad "$R: warn mode must count the same violations"

# --- the drop-in and its mode are committed files
[ -f "$SCRIPTS/check-ui.d/$R.sh" ] && ok || bad "scripts/check-ui.d/$R.sh must exist"
grep -Eq "^register_rule $R\$" "$SCRIPTS/check-ui.d/$R.sh" 2>/dev/null && ok || bad "scripts/check-ui.d/$R.sh must call register_rule $R"
RF="$SCRIPTS/check-ui.rules.d/b9-31.rules"
[ -f "$RF" ] && ok || bad "scripts/check-ui.rules.d/b9-31.rules must exist"
grep -Eq "^$R=fail\$" "$RF" 2>/dev/null && ok || bad "b9-31.rules: $R must be fail (plan section 9)"

# --- the real tree has no history-back left, so the committed rules pass
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC)"
n="$(awk -F'\t' -v r="$R" '$1 == r' "$TMP/real.txt" 2>/dev/null | wc -l)"
[ "$n" = 0 ] && ok || bad "$R: the real tree must have 0 violations (got $n): the Recipe editor's Cancel still uses navigate(-1)"

printf 'check-ui-b9-31_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
