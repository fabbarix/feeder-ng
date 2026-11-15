#!/usr/bin/env bash
# B9-17 (plan section 9, check-ui rule 20, DS-06, VC9): status-tone.
#   status-tone  20  a status or tone attribute or property set to 'spoil' or 'danger' (status="spoil", status={'danger'}, status: 'spoil',
#                    tone="danger"), in a non-test .ts or .tsx file under web/src, outside scripts/check-ui.allow-tones.
# spoil means food going off and danger means loss or destruction (system.md 2, VC9). A rule or a setting that needs a decision is warn,
# a question or a time to know is info, a record is neutral. The allowlist lists the files that really are food or destruction, each
# with its reason; a feature package converts its own other sites to warn, info or neutral and removes nothing else.
# Counting unit, which the fixtures fix: one violation per offending line. Comment lines (// ... and * ...) are not scanned.
# Mode: scripts/check-ui.rules.d/b9-17.rules says warn (it fails at B9-55, not before); the rule is a drop-in, scripts/check-ui.d/status-tone.sh.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
FIX="$HERE/fixtures/check-ui/status-tone"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
mkdir -p "$TMP/noallow" "$TMP/allow"
printf 'web/src/features/stock/UseSoon.tsx   # stock: Use soon is food going off\n' >"$TMP/allow/check-ui.allow-tones"

run_ui() { # ROOT RULES_FILE ALLOW_DIR -> RC, OUTPUT
  OUTPUT="$(CHECK_UI_ALLOW_DIR="$3" CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$1" --rules "$2" 2>&1)"
  RC=$?
}
count_of() { sed -nE "s/^ +status-tone +([0-9]+) violations.*/\1/p" <<<"$OUTPUT"; }
rules_file() { # mode [extra line]
  local f="$TMP/rules-$1-$RANDOM"
  echo "status-tone=$1" >"$f"
  [ -n "${2:-}" ] && echo "$2" >>"$f"
  echo "$f"
}

# --- the fail fixture: 7 violations, one per line, in a feature file and a primitive
run_ui "$FIX/fail" "$(rules_file fail)" "$TMP/noallow"
[ "$RC" -eq 1 ] && ok || bad "status-tone: the fail fixture must exit 1 in fail mode (got $RC)"
[ "$(count_of)" = 7 ] && ok || bad "status-tone: the fail fixture must report 7 violations (got '$(count_of)'): $(grep -E '^status-tone' "$TMP/out.txt" 2>/dev/null | cut -f2,3 | tr '\n' ' ')"
grep -q '^status-tone' "$TMP/out.txt" 2>/dev/null && ok || bad "status-tone: violations must be written to the CHECK_UI_OUT file"
grep -E '^status-tone' "$TMP/out.txt" 2>/dev/null | grep -Eq 'warn|info|neutral' && ok || bad "status-tone: the message must name the tones to use instead (warn, info, neutral)"
grep -E '^status-tone' "$TMP/out.txt" 2>/dev/null | grep -q 'check-ui.allow-tones' && ok || bad "status-tone: the message must name scripts/check-ui.allow-tones"

run_ui "$FIX/fail" "$(rules_file warn)" "$TMP/noallow"
[ "$RC" -eq 0 ] && ok || bad "status-tone: warn mode must never fail (got $RC)"
[ "$(count_of)" = 7 ] && ok || bad "status-tone: warn mode must count the same violations"

run_ui "$FIX/fail" "$(rules_file warn 'status-tone.fail_paths=web/src/ui')" "$TMP/noallow"
[ "$RC" -eq 1 ] && ok || bad "status-tone: fail_paths covering the primitive must exit 1 (got $RC)"
run_ui "$FIX/fail" "$(rules_file warn 'status-tone.fail_paths=web/src/app')" "$TMP/noallow"
[ "$RC" -eq 0 ] && ok || bad "status-tone: fail_paths elsewhere must not fail (got $RC)"

# --- the pass fixture: warn, info, neutral, leftover and success, comments, strings and look-alikes are clean
run_ui "$FIX/pass" "$(rules_file fail)" "$TMP/allow"
[ "$RC" -eq 0 ] && ok || bad "status-tone: the pass fixture must exit 0 in fail mode with its allowlist (got $RC): $(head -c 300 <<<"$OUTPUT")"
[ "$(count_of)" = 0 ] && ok || bad "status-tone: the pass fixture must report 0 violations (got '$(count_of)')"

# --- the allowlist: an allowed file is clean, the same file without the allowlist is a violation, an entry without a reason is ignored
run_ui "$FIX/pass" "$(rules_file fail)" "$TMP/noallow"
[ "$(count_of)" = 1 ] && ok || bad "status-tone: without the allowlist the stock file is 1 violation (got '$(count_of)')"
[ "$RC" -eq 1 ] && ok || bad "status-tone: ... and fails in fail mode (got $RC)"
mkdir -p "$TMP/noreason"
printf 'web/src/features/stock/UseSoon.tsx\n' >"$TMP/noreason/check-ui.allow-tones"
run_ui "$FIX/pass" "$(rules_file fail)" "$TMP/noreason"
[ "$(count_of)" = 1 ] && ok || bad "status-tone: an allowlist entry without a reason is ignored (got '$(count_of)')"

# --- test files are never scanned (the harness rule of check-ui.sh), and a primitive's own type union is not a violation
mkdir -p "$TMP/tree/web/src/ui" "$TMP/tree/web/src/features/x"
cat >"$TMP/tree/web/src/ui/Chip.tsx" <<'T'
export type ChipStatus = 'leftover' | 'spoil' | 'danger' | 'success' | 'pinned' | 'info' | 'warn' | 'neutral'
const DEFAULT_ICON = { danger: { state: 'notCooked' }, spoil: { state: 'goesOff' } }
export const x = DEFAULT_ICON
T
printf 'export const t = <Tile status="spoil" />\n' >"$TMP/tree/web/src/features/x/Thing.test.tsx"
run_ui "$TMP/tree" "$(rules_file fail)" "$TMP/noallow"
[ "$(count_of)" = 0 ] && ok || bad "status-tone: a type union, an icon map key and a test file are not violations (got '$(count_of)')"

# --- the drop-in, its mode and the allowlist are committed files
[ -f "$SCRIPTS/check-ui.d/status-tone.sh" ] && ok || bad "scripts/check-ui.d/status-tone.sh must exist (the drop-in of rule 20)"
grep -Eq '^register_rule status-tone$' "$SCRIPTS/check-ui.d/status-tone.sh" 2>/dev/null && ok || bad "scripts/check-ui.d/status-tone.sh must call register_rule status-tone"
RF="$SCRIPTS/check-ui.rules.d/b9-17.rules"
[ -f "$RF" ] && ok || bad "scripts/check-ui.rules.d/b9-17.rules must exist"
grep -Eq '^status-tone=warn$' "$RF" 2>/dev/null && ok || bad "b9-17.rules: status-tone must be warn (it fails at B9-55)"
! grep -Eq '^status-tone=fail' "$RF" 2>/dev/null && ok || bad "b9-17.rules: status-tone must not be fail yet"
AL="$SCRIPTS/check-ui.allow-tones"
[ -f "$AL" ] && ok || bad "scripts/check-ui.allow-tones must exist"
if [ -f "$AL" ]; then
  # every entry is `<exact path>   # reason`: a reason, an existing file, listed once
  nolines="$(grep -Ev '^[[:space:]]*(#|$)' "$AL" | grep -Ev '^[^#[:space:]][^#]*[^#[:space:]][[:space:]]+#[[:space:]]*[^[:space:]]' || true)"
  [ -z "$nolines" ] && ok || bad "check-ui.allow-tones: every entry needs a reason (<path>   # reason): $(head -2 <<<"$nolines" | tr '\n' ' ')"
  while IFS= read -r p; do
    [ -f "$ROOT/$p" ] && ok || bad "check-ui.allow-tones: $p does not exist"
  done < <(grep -Ev '^[[:space:]]*(#|$)' "$AL" | sed -E 's/[[:space:]]*#.*$//' | sed -E 's/[[:space:]]+$//')
  dups="$(grep -Ev '^[[:space:]]*(#|$)' "$AL" | sed -E 's/[[:space:]]*#.*$//' | sort | uniq -d)"
  [ -z "$dups" ] && ok || bad "check-ui.allow-tones: listed twice: $dups"
  grep -q 'web/src/ui/Gallery.tsx' "$AL" && ok || bad "check-ui.allow-tones: ui/Gallery.tsx shows every tone as a specimen and is listed with that reason"
fi

# --- the real tree: the committed rules pass (warn mode), and the primitives of this package set no spoil or danger tone
OUTPUT="$(CHECK_UI_OUT="$TMP/real.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui.sh on the real tree must pass the committed rules (got $RC)"
for f in Chip TimerTile TimerPill ViewfinderStrip Tile; do
  n="$(awk -F'\t' -v f="web/src/ui/$f.tsx" '$1 == "status-tone" && $2 == f' "$TMP/real.txt" | wc -l)"
  [ "$n" = 0 ] && ok || bad "status-tone: web/src/ui/$f.tsx must set no spoil or danger tone (got $n)"
done

printf 'check-ui-b9-17_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
