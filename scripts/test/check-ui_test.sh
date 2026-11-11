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

# native-search (warn-level by default): kept apart so that, until it exists, only these cases are red.
sf="$TMP/rules-search-warn"; { cat "$(rules_file sizing warn)"; echo "native-search=warn"; } >"$sf"
run_ui "$FIX/native-search/fail" "$sf"
[ "$RC" -eq 0 ] && [ "$(count_of native-search)" = 2 ] && ok || bad "native-search: expected 2 (single line, multi-line single-quoted) and exit 0 in warn mode (rc $RC, got $(count_of native-search))"
run_ui "$FIX/native-search/pass" "$sf"
[ "$RC" -eq 0 ] && [ "$(count_of native-search)" = 0 ] && ok || bad "native-search: pass fixture (SearchField, web/src/ui, tests, text input) must report 0 (rc $RC)"
sf="$TMP/rules-search-fail"; { cat "$(rules_file sizing warn)"; echo "native-search=fail"; } >"$sf"
run_ui "$FIX/native-search/fail" "$sf"
[ "$RC" -eq 1 ] && ok || bad "native-search=fail must exit 1 on the fail fixture (got $RC)"
grep -Eq "^native-search=(warn|fail)\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set native-search (warn)"
grep -Eq "^native-search=warn\$" "$SCRIPTS/check-ui.rules" && ok || bad "native-search must start at warn in check-ui.rules"

# back-link (R11a): BackLink, "Back to ..." links and IconButtons that navigate back are replaced by Breadcrumbs.
# Kept apart like native-search so that only these cases are red until the rule exists.
bf="$TMP/rules-backlink-warn"; { cat "$(rules_file sizing warn)"; echo "back-link=warn"; } >"$bf"
run_ui "$FIX/back-link/fail" "$bf"
[ "$RC" -eq 0 ] && [ "$(count_of back-link)" = 4 ] && ok || bad "back-link: expected 4 (BackLink import, <BackLink>, <Link>Back to ..., IconButton icon=back + navigate) and exit 0 in warn mode (rc $RC, got $(count_of back-link))"
run_ui "$FIX/back-link/pass" "$bf"
[ "$RC" -eq 0 ] && [ "$(count_of back-link)" = 0 ] && ok || bad "back-link: pass fixture (Breadcrumbs, comment, test file, back IconButton that is not navigation, Button 'Back to Today') must report 0 (rc $RC, got $(count_of back-link))"
bf="$TMP/rules-backlink-fail"; { cat "$(rules_file sizing warn)"; echo "back-link=fail"; } >"$bf"
run_ui "$FIX/back-link/fail" "$bf"
[ "$RC" -eq 1 ] && ok || bad "back-link=fail must exit 1 on the fail fixture (got $RC)"
bf="$TMP/rules-backlink-fp"; { cat "$(rules_file sizing warn)"; echo "back-link=warn"; echo "back-link.fail_paths=web/src/features/x"; } >"$bf"
run_ui "$FIX/back-link/fail" "$bf"
[ "$RC" -eq 1 ] && ok || bad "back-link.fail_paths covering the violations must exit 1 (got $RC)"
grep -Eq "^back-link=(warn|fail)\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set back-link (warn, or fail with fail_paths while Recipe and Import still carry theirs)"
grep -q "back-link" "$SCRIPTS/check-ui.sh" && ok || bad "check-ui.sh must document and implement the back-link rule"

# image-input (IM2): no feature builds its own image input; every image field is the shared <ImagePicker>.
# Flags accept= with an image type or extension, capture=, and the upload URLs '/api/images' and '/api/images/from-url' anywhere outside web/src/ui/ImagePicker.
# Kept apart like back-link so that only these cases are red until the rule exists.
ii="$TMP/rules-imginput-warn"; { cat "$(rules_file sizing warn)"; echo "image-input=warn"; } >"$ii"
run_ui "$FIX/image-input/fail" "$ii"
[ "$RC" -eq 0 ] && [ "$(count_of image-input)" = 6 ] && ok || bad "image-input: expected 6 (accept image/*, accept .png, capture, two upload URLs, a ui primitive outside ui/ImagePicker) and exit 0 in warn mode (rc $RC, got $(count_of image-input))"
run_ui "$FIX/image-input/pass" "$ii"
[ "$RC" -eq 0 ] && [ "$(count_of image-input)" = 0 ] && ok || bad "image-input: pass fixture (ui/ImagePicker itself, a .json FileDrop, a comment, a test file, a display URL) must report 0 (rc $RC, got $(count_of image-input))"
ii="$TMP/rules-imginput-fail"; { cat "$(rules_file sizing warn)"; echo "image-input=fail"; } >"$ii"
run_ui "$FIX/image-input/fail" "$ii"
[ "$RC" -eq 1 ] && ok || bad "image-input=fail must exit 1 on the fail fixture (got $RC)"
grep -Eq "^image-input=fail\$" "$SCRIPTS/check-ui.rules" && ok || bad "check-ui.rules must set image-input=fail (every image field is migrated by IM2)"
grep -q "image-input" "$SCRIPTS/check-ui.sh" && ok || bad "check-ui.sh must document and implement the image-input rule"
# The real tree is clean: Recipe photo, Step photo, Member photo and Ingredient picture all use the shared picker.
run_ui "$SCRIPTS/.." "$ii"
[ "$(count_of image-input)" = 0 ] && ok || bad "image-input: the real tree must have 0 violations (got $(count_of image-input)); see build/check-ui.txt"

# --- hardening cases: a pass and a fail fixture each, exact count for the fail one
harden() { # rule fixture-dir expected-count-in-fail-fixture
  run_ui "$FIX/$2/pass" "$(rules_file "$1" fail)"
  [ "$RC" -eq 0 ] && [ "$(count_of "$1")" = 0 ] && ok || bad "$2: pass fixture must be clean in fail mode (rc $RC): $OUTPUT"
  run_ui "$FIX/$2/fail" "$(rules_file "$1" fail)"
  [ "$RC" -eq 1 ] && [ "$(count_of "$1")" = "$3" ] && ok || bad "$2: fail fixture must report $3 in fail mode (rc $RC, got $(count_of "$1"))"
  run_ui "$FIX/$2/fail" "$(rules_file "$1" warn)"
  [ "$RC" -eq 0 ] && [ "$(count_of "$1")" = "$3" ] && ok || bad "$2: same fixture in warn mode must exit 0 with $3 (rc $RC, got $(count_of "$1"))"
}
harden native-ui native-ui-multiline 3   # <input> tags split across lines, incl. braces with '>'
harden colour-literals colour-named 5    # named colours in CSS declarations and style props
harden colour-literals colour-allow 2    # WP3b: file-level allow-colours (entry with reason skips the file; no reason or unlisted still flagged)
harden glossary glossary-quoting 4       # apostrophes in backtick strings, \' escapes, multi-line templates

# --- an allowlisted entry is what makes the pass fixtures pass ---------------
for r in class-hooks glossary; do
  run_ui "$FIX/$r/pass" "$(rules_file "$r" fail)"
  CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$FIX/$r/pass" --rules "$(rules_file "$r" fail)" >/dev/null 2>&1
  [ $? -eq 1 ] && ok || bad "$r: without its allowlist the pass fixture must fail"
done

# --- WP3b: the colour allowlist is what makes its pass fixture pass, and the real one names the Google G ----
run_ui "$FIX/colour-allow/pass" "$(rules_file colour-literals fail)"
CHECK_UI_ALLOW_DIR="$TMP/noallow" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$FIX/colour-allow/pass" --rules "$(rules_file colour-literals fail)" >/dev/null 2>&1
[ $? -eq 1 ] && ok || bad "colour-allow: without its allowlist the pass fixture must fail"
grep -Eq '^web/src/features/signin/components/GoogleG\.tsx +#' "$SCRIPTS/check-ui.allow-colours" && ok || bad "check-ui.allow-colours must list the signin Google G with a reason"

# --- fail_paths: only violations under the listed prefixes fail -------------
cp "$(rules_file sizing warn)" "$TMP/rules-fp-elsewhere"
echo "sizing.fail_paths=web/src/ui" >>"$TMP/rules-fp-elsewhere"
run_ui "$FIX/sizing/fail" "$TMP/rules-fp-elsewhere"
[ "$RC" -eq 0 ] && ok || bad "fail_paths elsewhere must not fail"
cp "$(rules_file sizing warn)" "$TMP/rules-fp-here"
echo "sizing.fail_paths=web/src/features/x" >>"$TMP/rules-fp-here"
run_ui "$FIX/sizing/fail" "$TMP/rules-fp-here"
[ "$RC" -eq 1 ] && ok || bad "fail_paths covering the violations must fail"

# A trailing slash on a prefix must behave exactly like the slash-less form.
for suffix in "" "/"; do
  cp "$(rules_file sizing warn)" "$TMP/rules-fp-slash"
  echo "sizing.fail_paths=web/src/features/x$suffix" >>"$TMP/rules-fp-slash"
  run_ui "$FIX/sizing/fail" "$TMP/rules-fp-slash"
  [ "$RC" -eq 1 ] && ok || bad "fail_paths 'web/src/features/x$suffix' covering the violations must fail (got $RC)"
done
cp "$(rules_file sizing warn)" "$TMP/rules-fp-slash2"
echo "sizing.fail_paths=web/src/ui/ web/src/features/x/" >>"$TMP/rules-fp-slash2"
run_ui "$FIX/sizing/fail" "$TMP/rules-fp-slash2"
[ "$RC" -eq 1 ] && ok || bad "fail_paths with several trailing-slash prefixes must fail when one covers the violations (got $RC)"

# --- a flag without its value is a usage error, never a hang ------------------
for flag in --root --rules; do
  OUTPUT="$(timeout 5 bash "$SCRIPTS/check-ui.sh" "$flag" 2>&1)"; RC=$?
  [ "$RC" -eq 2 ] && ok || bad "$flag without a value must exit 2 (got $RC; 124 means it hung)"
  grep -qi "usage" <<<"$OUTPUT" && ok || bad "$flag without a value must print a usage message (got: $OUTPUT)"
done

# --- every glossary allowlist entry says why --------------------------------
awk '!/^[ \t]*(#|$)/ && !/#[ \t]*[^ \t]/ { print FILENAME ":" FNR ": " $0; bad = 1 } END { exit bad }' "$SCRIPTS/check-ui.allow-glossary" >"$TMP/noreason.txt"
[ $? -eq 0 ] && ok || bad "allow-glossary entries need a '# reason': $(cat "$TMP/noreason.txt")"

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
