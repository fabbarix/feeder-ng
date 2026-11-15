#!/usr/bin/env bash
# B9-16 (plan section 9, check-ui rule 24, SAFE-04): the alert-in-form detector.
#   alert-in-form  24  role="alert" in a file that renders a <form>, other than ui/fields/FormError.tsx
# Counting unit, which the fixtures fix: one violation per role="alert" occurrence (three in the fail fixture: one in MemberForm, two in
# RulesForm, written role="alert", role='alert' and role={"alert"}). The rule is a drop-in (scripts/check-ui.d/alert-in-form.sh); its mode is
# scripts/check-ui.rules.d/b9-16.rules: warn, and fail under web/src/ui and web/src/app.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
FIX="$HERE/fixtures/check-ui/alert-in-form"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow"

run_ui() { # ROOT RULES_FILE -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # mode [extra line]
  local f="$TMP/rules-$1-$RANDOM"
  echo "alert-in-form=$1" >"$f"
  [ -n "${2:-}" ] && echo "$2" >>"$f"
  echo "$f"
}
R=alert-in-form

run_ui "$FIX/pass" "$(rules_file fail)"
[ "$RC" -eq 0 ] && ok || bad "$R: pass fixture must exit 0 in fail mode (got $RC): $(head -c 400 <<<"$OUTPUT")"
[ "$(count_of $R)" = 0 ] && ok || bad "$R: pass fixture must report 0 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | head -3 | tr '\n' ' ')"

run_ui "$FIX/fail" "$(rules_file fail)"
[ "$RC" -eq 1 ] && ok || bad "$R: fail fixture must exit 1 in fail mode (got $RC)"
[ "$(count_of $R)" = 3 ] && ok || bad "$R: fail fixture must report 3 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
grep -q "^$R" "$TMP/out.txt" 2>/dev/null && ok || bad "$R: violations must be written to the CHECK_UI_OUT file"
grep -Eq 'FormError' "$TMP/out.txt" 2>/dev/null && ok || bad "$R: the message must point to FormError"
grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2 | sort -u | tr '\n' ' ' | grep -q 'RulesForm.tsx' && ok || bad "$R: the violation must name the file (RulesForm.tsx)"

run_ui "$FIX/fail" "$(rules_file warn)"
[ "$RC" -eq 0 ] && ok || bad "$R: warn mode must never fail (got $RC)"
[ "$(count_of $R)" = 3 ] && ok || bad "$R: warn mode must count the same violations"

run_ui "$FIX/fail" "$(rules_file warn "$R.fail_paths=web/src/features/x")"
[ "$RC" -eq 1 ] && ok || bad "$R: fail_paths covering the violations must exit 1 (got $RC)"
run_ui "$FIX/fail" "$(rules_file warn "$R.fail_paths=web/src/ui web/src/app")"
[ "$RC" -eq 0 ] && ok || bad "$R: fail_paths elsewhere must not fail (got $RC)"

# --- the drop-in and its modes are committed files
[ -f "$SCRIPTS/check-ui.d/$R.sh" ] && ok || bad "scripts/check-ui.d/$R.sh must exist"
grep -Eq "^register_rule $R\$" "$SCRIPTS/check-ui.d/$R.sh" 2>/dev/null && ok || bad "scripts/check-ui.d/$R.sh must call register_rule $R"
RF="$SCRIPTS/check-ui.rules.d/b9-16.rules"
[ -f "$RF" ] && ok || bad "scripts/check-ui.rules.d/b9-16.rules must exist"
grep -Eq "^$R=warn\$" "$RF" 2>/dev/null && ok || bad "b9-16.rules: $R must be warn (B9-55 flips it)"
grep -Eq "^$R\.fail_paths=.*web/src/ui( |\$)" "$RF" 2>/dev/null && ok || bad "b9-16.rules: $R.fail_paths must list web/src/ui"
grep -Eq "^$R\.fail_paths=.*web/src/app( |\$)" "$RF" 2>/dev/null && ok || bad "b9-16.rules: $R.fail_paths must list web/src/app"

# --- the real tree: web/src/ui and web/src/app are clean, and the committed rules pass
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC)"
n="$(awk -F'\t' -v r="$R" '$1 == r && ($2 ~ /^web\/src\/ui\// || $2 ~ /^web\/src\/app\//)' "$TMP/real.txt" | wc -l)"
[ "$n" = 0 ] && ok || bad "$R: web/src/ui and web/src/app must have 0 violations (got $n)"

printf 'check-ui-b9-16_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
