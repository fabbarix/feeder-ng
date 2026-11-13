#!/usr/bin/env bash
# DS-A (docs/design/system.md §1, §3, §10; ADR 0016): three new check-ui rules.
#   type-scale      a font-size / font that is not a --text-* token (or inherit), outside a token block: a rule whose every
#                   selector is ^(:root|html(\[[^\]]*\])*)$ (":root .x", "html .x" and "[data-theme] .x" are feature rules)
#   opacity-muting  opacity between 0.5 and 0.95 (or 50%..95%) on a selector that is not a disabled state: use --color-muted
#   word-break      hyphens: auto, overflow-wrap / word-wrap: anywhere|break-word, word-break: break-all|break-word, unless the
#                   the LAST compound of the selector names a one-token value (email, url, link, barcode, code); a selector
#                   list is judged per selector, one violation per offending selector
# Each fails in web/src/ui and the screens redone in beta.5.1 (shop, today, plan) and warns elsewhere (check-ui.rules fail_paths).
# Kept apart from check-ui_test.sh so the older rules' tests stay green while these are red.
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

OLD=(native-ui phosphor colour-literals class-hooks sizing glossary)
NEW=(type-scale opacity-muting word-break)
# round 2: type-scale exempts only a bare token block (every selector ^(:root|html([...])*)$); word-break reads the last compound
# selector, per selector of a group (one violation per offending selector).
declare -A EXPECT=([type-scale]=7 [opacity-muting]=3 [word-break]=9)

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

# --- each rule: pass fixture clean in fail mode, fail fixture flagged with an exact count; warn mode never fails
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

  # fail_paths: violations under a listed prefix fail, elsewhere they warn
  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/features/x")"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail_paths covering the violations must exit 1 (got $RC)"
  run_ui "$FIX/$r/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/ui")"
  [ "$RC" -eq 0 ] && ok || bad "$r: fail_paths elsewhere must not fail (got $RC)"
done

# --- messages name the property and the fix
run_ui "$FIX/type-scale/fail" "$(rules_file type-scale warn)"
grep -q -- '--text-' "$TMP/out.txt" && ok || bad "type-scale: the message must point to the --text-* tokens"
run_ui "$FIX/opacity-muting/fail" "$(rules_file opacity-muting warn)"
grep -q -- '--color-muted' "$TMP/out.txt" && ok || bad "opacity-muting: the message must point to --color-muted"
run_ui "$FIX/word-break/fail" "$(rules_file word-break warn)"
grep -Eq 'line-tile__title|plan-meal__recipe' "$TMP/out.txt" && ok || bad "word-break: the report must name the selector"
grep -q "recipe-title" "$TMP/out.txt" && ok || bad "word-break: in '.share-url, .recipe-title' the report names .recipe-title"
grep -Eq "word-break.*'\.share-url'" "$TMP/out.txt" && bad "word-break: '.share-url' in a group stays exempt" || ok

# --- the header documents the three rules, and RULE_NAMES knows them
for r in "${NEW[@]}"; do
  grep -Eq "^#   $r " "$SCRIPTS/check-ui.sh" && ok || bad "check-ui.sh header must document $r"
  grep -E '^RULE_NAMES=' "$SCRIPTS/check-ui.sh" | grep -q "$r" && ok || bad "check-ui.sh RULE_NAMES must include $r"
done

# --- the committed rules file: warn by default, fail in the shared ui and the beta.5.1 screens
for r in "${NEW[@]}"; do
  grep -Eq "^$r=warn\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set $r=warn (screens not redone yet only warn)"
  for p in web/src/ui web/src/features/shop web/src/features/today web/src/features/plan; do
    grep -E "^$r\.fail_paths=" "$SCRIPTS/check-ui.rules" | grep -Eq "(=| )$p( |\$)" && ok || bad "check-ui.rules: $r.fail_paths must list $p"
  done
done

# --- the real tree passes the committed rules (the shared ui and Shop, Today, Plan are clean of all three)
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC); see: $(grep -E 'type-scale|opacity-muting|word-break' "$TMP/real.txt" 2>/dev/null | grep -E 'web/src/(ui|features/(shop|today|plan))/' | head -5 | tr '\n' ' ')"

printf 'check-ui-ds_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
