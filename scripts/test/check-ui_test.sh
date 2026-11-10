#!/usr/bin/env bash
# Tests scripts/check-ui.sh: per rule a passing and a failing fixture, the warn/fail
# modes (including fail_paths), and that check.sh only fails on a fail-mode rule.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
FIX="$HERE/fixtures/check-ui"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
RULES=(native-ui phosphor colour-literals class-hooks sizing glossary)

ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

mkdir -p "$TMP/noallow"

# run_ui ROOT RULES_FILE -> sets RC and OUTPUT; allowlists come from ROOT/../allow or an empty dir.
run_ui() {
  local root="$1" rules="$2" allow="$TMP/noallow"
  [ -d "$root/allow" ] && allow="$root/allow"
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$allow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$root" --rules "$rules" 2>&1)"
  RC=$?
}
count_of() { # rule -> number printed in the summary
  sed -nE "s/^ +$1 +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"
}
rules_file() { # name mode-for-rule  (all other rules warn)
  local f="$TMP/rules-$1-$2" r
  : >"$f"
  for r in "${RULES[@]}"; do
    if [ "$r" = "$1" ]; then echo "$r=$2" >>"$f"; else echo "$r=warn" >>"$f"; fi
  done
  echo "$f"
}

# --- every rule: pass fixture is clean, fail fixture is flagged -------------
for r in "${RULES[@]}"; do
  run_ui "$FIX/$r/pass" "$(rules_file "$r" fail)"
  [ "$RC" -eq 0 ] && ok || bad "$r: pass fixture must exit 0 in fail mode (got $RC): $OUTPUT"
  [ "$(count_of "$r")" = 0 ] && ok || bad "$r: pass fixture must report 0 violations (got $(count_of "$r"))"

  run_ui "$FIX/$r/fail" "$(rules_file "$r" fail)"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail fixture must exit 1 in fail mode (got $RC)"
  n="$(count_of "$r")"
  [ -n "$n" ] && [ "$n" -gt 0 ] && ok || bad "$r: fail fixture must report violations (got '$n')"

  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn)"
  [ "$RC" -eq 0 ] && ok || bad "$r: warn mode must never fail (got $RC)"
  [ "$(count_of "$r")" = "$n" ] && ok || bad "$r: warn mode must count the same violations as fail mode"
  grep -q "violations  \[warn\]" <<<"$OUTPUT" && ok || bad "$r: summary must show the mode"
done

# --- exact counts for the multi-violation fixtures (guards the detectors) ---
run_ui "$FIX/native-ui/fail" "$(rules_file native-ui warn)"
[ "$(count_of native-ui)" = 3 ] && ok || bad "native-ui: expected 3 (select, checkbox, confirm), got $(count_of native-ui)"
run_ui "$FIX/phosphor/fail" "$(rules_file phosphor warn)"
[ "$(count_of phosphor)" = 2 ] && ok || bad "phosphor: expected 2 (outside icons.ts, barrel in icons.ts), got $(count_of phosphor)"
run_ui "$FIX/colour-literals/fail" "$(rules_file colour-literals warn)"
[ "$(count_of colour-literals)" = 3 ] && ok || bad "colour-literals: expected 3 (hex, rgba, tsx hex), got $(count_of colour-literals)"
run_ui "$FIX/class-hooks/fail" "$(rules_file class-hooks warn)"
[ "$(count_of class-hooks)" = 4 ] && ok || bad "class-hooks: expected 4 (undefined-one, badge, badge-- prefix, icon-off), got $(count_of class-hooks)"
run_ui "$FIX/sizing/fail" "$(rules_file sizing warn)"
[ "$(count_of sizing)" = 3 ] && ok || bad "sizing: expected 3 (min-height, px css, px tsx), got $(count_of sizing)"
run_ui "$FIX/glossary/fail" "$(rules_file glossary warn)"
[ "$(count_of glossary)" = 2 ] && ok || bad "glossary: expected 2 (dish, meal), got $(count_of glossary)"

# --- an allowlisted entry is what makes the pass fixtures pass ---------------
for r in class-hooks glossary; do
  run_ui "$FIX/$r/pass" "$(rules_file "$r" fail)"
  CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$FIX/$r/pass" --rules "$(rules_file "$r" fail)" >/dev/null 2>&1
  [ $? -eq 1 ] && ok || bad "$r: without its allowlist the pass fixture must fail"
done

# --- fail_paths: only violations under the listed prefixes fail -------------
cp "$(rules_file sizing warn)" "$TMP/rules-fp-elsewhere"
echo "sizing.fail_paths=web/src/ui" >>"$TMP/rules-fp-elsewhere"
run_ui "$FIX/sizing/fail" "$TMP/rules-fp-elsewhere"
[ "$RC" -eq 0 ] && ok || bad "fail_paths elsewhere must not fail"
cp "$(rules_file sizing warn)" "$TMP/rules-fp-here"
echo "sizing.fail_paths=web/src/features/x" >>"$TMP/rules-fp-here"
run_ui "$FIX/sizing/fail" "$TMP/rules-fp-here"
[ "$RC" -eq 1 ] && ok || bad "fail_paths covering the violations must fail"

# --- bad rules file is rejected ---------------------------------------------
echo "sizing=maybe" >"$TMP/rules-bad"
run_ui "$FIX/sizing/pass" "$TMP/rules-bad"
[ "$RC" -eq 2 ] && ok || bad "unknown mode must exit 2 (got $RC)"
echo "nosuchrule=fail" >"$TMP/rules-bad2"
run_ui "$FIX/sizing/pass" "$TMP/rules-bad2"
[ "$RC" -eq 2 ] && ok || bad "unknown rule must exit 2 (got $RC)"

# --- the real tree: the committed rules file parses and every rule starts in warn
for r in "${RULES[@]}"; do
  grep -Eq "^$r=(warn|fail)\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set $r"
done

# --- check.sh: warn mode never fails it, fail mode does ---------------------
# Build a throwaway repo layout so check.sh writes its log and runs only the UI step.
sandbox() { # name rules-file
  local d="$TMP/repo-$1"
  mkdir -p "$d/scripts" "$d/web"
  cp "$SCRIPTS/check.sh" "$SCRIPTS/check-ui.sh" "$d/scripts/"
  cp "$2" "$d/scripts/check-ui.rules"
  cp -r "$FIX/sizing/fail/web/src" "$d/web/src"
  echo "$d"
}
d="$(sandbox warn "$(rules_file sizing warn)")"
CHECK_ONLY=ui bash "$d/scripts/check.sh" >"$TMP/check-warn.out" 2>&1
[ $? -eq 0 ] && ok || bad "check.sh must pass when violations are in warn mode"
grep -q "sizing .* 3 violations" "$TMP/check-warn.out" && ok || bad "check.sh output must show the violation counts"
grep -q "sizing .* 3 violations" "$d/build/check.log" && ok || bad "violation counts must reach build/check.log"
d="$(sandbox fail "$(rules_file sizing fail)")"
CHECK_ONLY=ui bash "$d/scripts/check.sh" >"$TMP/check-fail.out" 2>&1
[ $? -ne 0 ] && ok || bad "check.sh must fail when a fail-mode rule has violations"
grep -q "CHECK FAILED" "$d/build/check.log" && ok || bad "failure must be recorded in build/check.log"

printf 'check-ui_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
