#!/usr/bin/env bash
# B9-29 (plan section 9, check-ui rule 26, SAFE-11): no-first-choice-default.
#   no-first-choice-default  26  `?? choices[0]` / `?? options[0]` (also `?? props.choices[0]`, `?? options[0]?.value`) in a non-test .ts or .tsx
#                                file under web/src/features: a form never starts on an arbitrary first Ingredient or option.
# Counting unit, which the fixtures fix: one violation per matching expression (a line with two is two). Comment lines (// and * and /* */)
# are not scanned; a name that merely ends in "choices" (restChoices) is not a match; web/src/ui is not scanned (a primitive
# may show its first option). Mode: scripts/check-ui.rules.d/b9-29.rules says warn (rule 26 is "warn" in the plan); the drop-in is
# scripts/check-ui.d/no-first-choice-default.sh.
# Also: B9-29's own folder is clean of both this rule and status-tone (DS-06), read from a real run over this checkout.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
FIX="$HERE/fixtures/check-ui/no-first-choice-default"
R=no-first-choice-default
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow"

run_ui() { # ROOT RULES_FILE -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="${ALLOW_DIR:-$TMP/noallow}" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # mode [extra line]
  local f="$TMP/rules-$1-$RANDOM"
  echo "$R=$1" >"$f"
  [ -n "${2:-}" ] && echo "$2" >>"$f"
  echo "$f"
}

# --- the fail fixture: 6 violations (AddLotSheet: ?? choices[0], ?? options[0], ?? props.choices[0], and two on the last line; ExtraSheet: 1)
run_ui "$FIX/fail" "$(rules_file fail)"
[ "$RC" -eq 1 ] && ok || bad "$R: the fail fixture must exit 1 in fail mode (got $RC)"
[ "$(count_of $R)" = 6 ] && ok || bad "$R: the fail fixture must report 6 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
grep -q "^$R" "$TMP/out.txt" 2>/dev/null && ok || bad "$R: violations must be written to the CHECK_UI_OUT file"
grep -E "^$R" "$TMP/out.txt" 2>/dev/null | grep -q 'AddLotSheet.tsx' && ok || bad "$R: a violation must name the file (AddLotSheet.tsx)"
grep -E "^$R" "$TMP/out.txt" 2>/dev/null | grep -Eqi 'placeholder|Choose|never|arbitrary' && ok || bad "$R: the message must say why (no arbitrary first choice; start on a placeholder)"

run_ui "$FIX/fail" "$(rules_file warn)"
[ "$RC" -eq 0 ] && ok || bad "$R: warn mode must never fail (got $RC)"
[ "$(count_of $R)" = 6 ] && ok || bad "$R: warn mode must count the same violations"

run_ui "$FIX/fail" "$(rules_file warn "$R.fail_paths=web/src/features/shop")"
[ "$RC" -eq 1 ] && ok || bad "$R: fail_paths covering a violation must exit 1 (got $RC)"
run_ui "$FIX/fail" "$(rules_file warn "$R.fail_paths=web/src/features/recipes")"
[ "$RC" -eq 0 ] && ok || bad "$R: fail_paths elsewhere must not fail (got $RC)"

# --- the pass fixture
run_ui "$FIX/pass" "$(rules_file fail)"
[ "$RC" -eq 0 ] && ok || bad "$R: the pass fixture must exit 0 in fail mode (got $RC): $(head -c 300 <<<"$OUTPUT")"
[ "$(count_of $R)" = 0 ] && ok || bad "$R: the pass fixture must report 0 violations (got '$(count_of $R)'): $(grep -E "^$R" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"

# --- the drop-in and its mode are committed files
[ -f "$SCRIPTS/check-ui.d/$R.sh" ] && ok || bad "scripts/check-ui.d/$R.sh must exist"
grep -Eq "^register_rule $R\$" "$SCRIPTS/check-ui.d/$R.sh" 2>/dev/null && ok || bad "scripts/check-ui.d/$R.sh must call register_rule $R"
RF="$SCRIPTS/check-ui.rules.d/b9-29.rules"
[ -f "$RF" ] && ok || bad "scripts/check-ui.rules.d/b9-29.rules must exist"
grep -Eq "^$R=warn\$" "$RF" 2>/dev/null && ok || bad "b9-29.rules: $R must be warn"
grep -Eq "^$R\.fail_paths=.*web/src/features/stock( |\$)" "$RF" 2>/dev/null && ok || bad "b9-29.rules: $R.fail_paths must list web/src/features/stock (B9-29 is clean of it)"

# --- the real tree: B9-29's folder is clean of this rule and of status-tone (the allowlist lists what is food going off or a loss, with a
# reason). ShortfallNotice.tsx and StockCorrectionSheet.tsx are B9-45's and are left out. Read from the real allowlist directory.
REAL="$TMP/real.rules"
printf '%s=warn\nstatus-tone=warn\n' "$R" >"$REAL"
ALLOW_DIR="$SCRIPTS" run_ui "$ROOT" "$REAL"
mine() { grep -E "^($1)\s" "$TMP/out.txt" 2>/dev/null | grep 'web/src/features/stock/' | grep -vE 'ShortfallNotice\.tsx|StockCorrectionSheet\.tsx' | cut -f2,3 | tr '\n' ' '; }
[ -z "$(mine "$R")" ] && ok || bad "$R: features/stock must have no first-choice default: $(mine "$R")"
[ -z "$(mine status-tone)" ] && ok || bad "status-tone: features/stock must have no spoil or danger tone outside scripts/check-ui.allow-tones: $(mine status-tone)"
unset ALLOW_DIR
# every B9-29 allowlist entry says why
awk -F'#' '/web\/src\/features\/stock\// { r = $2; gsub(/[ \t]/, "", r); if (r == "") { bad = 1 } } END { exit bad }' "$SCRIPTS/check-ui.allow-tones" && ok || bad "check-ui.allow-tones: an entry under features/stock has no reason"

printf 'check-ui-b9-29: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
