#!/usr/bin/env bash
# B9-07 (plan section 9, check-ui rules 17 to 19, 21, 22 and the wider opacity-muting): the sweep detectors.
#   raw-radius     17  a border-radius (or a corner radius) with a px or rem number other than 0, once var(...) is taken out; 50% stays allowed
#   raw-spacing    18  gap, row-gap, column-gap, padding*, margin*, inset* with a px or rem number other than 0 and 1px once var(...) is taken
#                      out, calc() included (the awk of ui-review-3/ds.md DS-11); outside a token block (:root, html[...])
#   media-width    19  a width @media that is not (min-width: Xem) or (width < Xem) with X in {23.5, 37.5, 48, 64, 80, 90}; a px width in an
#                      @container; a useMediaQuery('...width...') call outside web/src/ui/lib/ (use useBreakpoint / useNarrow)
#   focus-ring     21  a box-shadow: var(--focus-ring) anywhere, or outline: none in a :focus-visible rule whose last compound is not on the
#                      allow-list (.ui-field__input, .search-field__input, .ui-field__textarea, .time-field__segment, .segmented__option)
#   scheme-attr    22  a data-theme selector, or prefers-color-scheme in a stylesheet other than web/src/styles.css
#   opacity-muting 11  WIDER (built in, edited in scripts/check-ui.sh): 0.05 to 0.95 instead of 0.5 to 0.95; exempts a disabled state, a
#                      pseudo-element selector, a @keyframes step, and a selector whose last compound names __glyph or __icon
# Counting units, which the fixtures fix: one violation per offending declaration (focus-ring, raw-radius, raw-spacing, opacity-muting) or per
# offending @media / @container line or call (media-width) or per selector or query line (scheme-attr).
# The five new rules are drop-ins (scripts/check-ui.d/<name>.sh); their modes are scripts/check-ui.rules.d/b9-07.rules: warn, and fail under
# web/src/ui and web/src/app (the other folders flip in B9-08 to B9-10 and B9-55). The committed tree has none of them in ui/ and app/.
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

OLD=(native-ui phosphor colour-literals class-hooks sizing glossary native-search back-link image-input type-scale opacity-muting word-break button-variant close-button sheet-cancel bullet-notice)
NEW=(raw-radius raw-spacing media-width focus-ring scheme-attr)
declare -A EXPECT=([raw-radius]=5 [raw-spacing]=6 [media-width]=8 [focus-ring]=4 [scheme-attr]=3 [opacity-muting]=3)
declare -A FIXDIR=([raw-radius]=raw-radius [raw-spacing]=raw-spacing [media-width]=media-width [focus-ring]=focus-ring [scheme-attr]=scheme-attr [opacity-muting]=opacity-muting-wide)

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

for r in "${NEW[@]}" opacity-muting; do
  d="$FIX/${FIXDIR[$r]}"
  run_ui "$d/pass" "$(rules_file "$r" fail)"
  [ "$RC" -eq 0 ] && ok || bad "$r: pass fixture must exit 0 in fail mode (got $RC): $(head -c 400 <<<"$OUTPUT")"
  [ "$(count_of "$r")" = 0 ] && ok || bad "$r: pass fixture must report 0 violations (got '$(count_of "$r")'): $(grep -E "^$r" "$TMP/out.txt" 2>/dev/null | head -3 | tr '\n' ' ')"

  run_ui "$d/fail" "$(rules_file "$r" fail)"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail fixture must exit 1 in fail mode (got $RC)"
  [ "$(count_of "$r")" = "${EXPECT[$r]}" ] && ok || bad "$r: fail fixture must report ${EXPECT[$r]} violations (got '$(count_of "$r")'): $(grep -E "^$r" "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
  grep -q "^$r" "$TMP/out.txt" 2>/dev/null && ok || bad "$r: violations must be written to the CHECK_UI_OUT file"

  run_ui "$d/fail" "$(rules_file "$r" warn)"
  [ "$RC" -eq 0 ] && ok || bad "$r: warn mode must never fail (got $RC)"
  [ "$(count_of "$r")" = "${EXPECT[$r]}" ] && ok || bad "$r: warn mode must count the same violations"

  run_ui "$d/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/features/x web/src/ui")"
  [ "$RC" -eq 1 ] && ok || bad "$r: fail_paths covering the violations must exit 1 (got $RC)"
  run_ui "$d/fail" "$(rules_file "$r" warn "$r.fail_paths=web/src/app")"
  [ "$RC" -eq 0 ] && ok || bad "$r: fail_paths elsewhere must not fail (got $RC)"
done

# --- the messages name the fix
run_ui "$FIX/raw-radius/fail" "$(rules_file raw-radius warn)";   grep -q -- '--radius' "$TMP/out.txt" && ok || bad "raw-radius: the message must point to the --radius-* tokens"
run_ui "$FIX/raw-spacing/fail" "$(rules_file raw-spacing warn)"; grep -q -- '--space' "$TMP/out.txt" && ok || bad "raw-spacing: the message must point to the --space-* tokens"
run_ui "$FIX/media-width/fail" "$(rules_file media-width warn)"; grep -Eq 'useBreakpoint|37\.5em|breakpoint' "$TMP/out.txt" && ok || bad "media-width: the message must point to the breakpoint table or useBreakpoint"
run_ui "$FIX/focus-ring/fail" "$(rules_file focus-ring warn)";   grep -q -- '--focus-ring' "$TMP/out.txt" && ok || bad "focus-ring: the message must point to the ring tokens"
run_ui "$FIX/scheme-attr/fail" "$(rules_file scheme-attr warn)"; grep -q -- 'data-scheme' "$TMP/out.txt" && ok || bad "scheme-attr: the message must point to data-scheme"
run_ui "$FIX/opacity-muting-wide/fail" "$(rules_file opacity-muting warn)"; grep -q -- '--color-muted' "$TMP/out.txt" && ok || bad "opacity-muting: the message must still point to --color-muted"

# --- the old opacity fixtures keep their count (0.5-0.95 still flagged; the decorative .row__glyph at 0.4 is exempt)
run_ui "$FIX/opacity-muting/fail" "$(rules_file opacity-muting warn)"
[ "$(count_of opacity-muting)" = 3 ] && ok || bad "opacity-muting: the original fail fixture still reports 3 (got '$(count_of opacity-muting)')"
run_ui "$FIX/opacity-muting/pass" "$(rules_file opacity-muting fail)"
[ "$RC" -eq 0 ] && ok || bad "opacity-muting: the original pass fixture still passes (got $RC)"

# --- w6a: the selector-level opacity allowlist drops exactly the named selector list (with a reason), nothing else
mkdir -p "$TMP/opallow"
printf '%s\n' ".course-eaters__pill[aria-pressed=\"false\"]   # a designed resting state" ".badge" >"$TMP/opallow/check-ui.allow-opacity"
OUTPUT="$(CHECK_UI_ALLOW_DIR="$TMP/opallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$FIX/opacity-muting-wide/fail" --rules "$(rules_file opacity-muting warn)" 2>&1)"
[ "$(count_of opacity-muting)" = 2 ] && ok || bad "opacity-muting: an allow entry with a reason drops its one selector, one without a reason none (got '$(count_of opacity-muting)')"
grep -q 'course-eaters__pill' "$TMP/out.txt" && bad "opacity-muting: the allowed selector must not be reported" || ok
grep -q "board-close\[data-idle='true'\]   # " "$SCRIPTS/check-ui.allow-opacity" && ok || bad "check-ui.allow-opacity: the board's idle Close (TB 4) is the committed entry, with its reason"

# --- the drop-ins and their modes are committed files
for r in "${NEW[@]}"; do
  [ -f "$SCRIPTS/check-ui.d/$r.sh" ] && ok || bad "scripts/check-ui.d/$r.sh must exist (the drop-in of rule $r)"
  grep -Eq "^register_rule $r\$" "$SCRIPTS/check-ui.d/$r.sh" 2>/dev/null && ok || bad "scripts/check-ui.d/$r.sh must call register_rule $r"
done
RF="$SCRIPTS/check-ui.rules.d/b9-07.rules"
[ -f "$RF" ] && ok || bad "scripts/check-ui.rules.d/b9-07.rules must exist"
for r in "${NEW[@]}" opacity-muting; do
  grep -Eq "^$r\.fail_paths=.*web/src/ui( |\$)" "$RF" 2>/dev/null && ok || bad "b9-07.rules: $r.fail_paths must list web/src/ui"
  grep -Eq "^$r\.fail_paths=.*web/src/app( |\$)" "$RF" 2>/dev/null && ok || bad "b9-07.rules: $r.fail_paths must list web/src/app"
done
for r in "${NEW[@]}"; do
  grep -Eq "^$r=warn\$" "$RF" 2>/dev/null && ok || bad "b9-07.rules: $r must be warn (the feature folders flip it as each sweep lands)"
done
grep -E '^opacity-muting\.fail_paths=' "$RF" 2>/dev/null | grep -q 'web/src/features/shop' && ok || bad "b9-07.rules: opacity-muting.fail_paths must keep the folders already clean (shop, today, plan, tags)"

# --- the real tree is clean of all six rules in web/src/ui and web/src/app, and the committed rules pass
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC)"
for r in "${NEW[@]}" opacity-muting; do
  n="$(awk -F'\t' -v r="$r" '$1 == r && ($2 ~ /^web\/src\/ui\// || $2 ~ /^web\/src\/app\//)' "$TMP/real.txt" | wc -l)"
  [ "$n" = 0 ] && ok || bad "$r: web/src/ui and web/src/app must have 0 violations (got $n): $(awk -F'\t' -v r="$r" '$1 == r && ($2 ~ /^web\/src\/ui\// || $2 ~ /^web\/src\/app\//) { print $2 ":" $3 }' "$TMP/real.txt" | head -3 | tr '\n' ' ')"
done

printf 'check-ui-b9-07_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
