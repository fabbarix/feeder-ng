#!/usr/bin/env bash
# B9-52 (SET-03, SET-12; plan section 9: check-ui `word-break` gains the Allowlist and Sign-in requests folders).
# The rule itself already flags overflow-wrap: anywhere|break-word, word-break: break-all|break-word and hyphens: auto (an email may
# wrap only at "@" and "." through <wbr>, never mid-word). This test pins that:
#   1. scripts/check-ui.rules.d/b9-52.rules adds web/src/features/settings and web/src/features/access to word-break.fail_paths;
#   2. with the committed rules, check-ui finds no word-break violation in those two folders (settings.css and access.css are clean).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SCRIPTS/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

RULES="$SCRIPTS/check-ui.rules.d/b9-52.rules"
if [ -f "$RULES" ]; then
  for dir in web/src/features/settings web/src/features/access; do
    grep -E '^word-break\.fail_paths=' "$RULES" | grep -qE "(=| )$dir( |$)" && ok || bad "b9-52.rules: word-break.fail_paths must list $dir"
  done
else
  bad "scripts/check-ui.rules.d/b9-52.rules is missing (word-break.fail_paths=web/src/features/settings web/src/features/access)"
fi

OUTPUT="$(CHECK_UI_OUT="$TMP/out.txt" bash "$SCRIPTS/check-ui.sh" --root "$ROOT" 2>&1)"
[ -f "$TMP/out.txt" ] && ok || bad "check-ui wrote no output file: $(head -c 300 <<<"$OUTPUT")"
found="$(awk -F'\t' '$1 == "word-break" && $2 ~ /^web\/src\/features\/(settings|access)\// { print $2 ":" $3 }' "$TMP/out.txt" 2>/dev/null | tr '\n' ' ')"
[ -z "$found" ] && ok || bad "word-break violations remain in settings/access: $found"

printf 'check-ui-b9-52: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
