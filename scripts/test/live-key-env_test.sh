#!/usr/bin/env bash
# The key of the opt-in live Anthropic tests (docs/dev/design/b8-rxgo.md, docs/dev/live-tests.md): one rule, in one
# package. No Go test reads the key variables itself, the docs name every accepted variable, and the key is never printed.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

NAMES='FEEDER_ANTHROPIC_KEY|FEEDER_LIVE_ANTHROPIC_KEY|ANTHROPIC_KEY'

# 1. Only internal/testkit/anthropickey reads the three names (os.Getenv / os.LookupEnv / t.Setenv aside, which are tests of it).
mapfile -t readers < <(grep -rlE "os\.(Getenv|LookupEnv)\(\"($NAMES)\"\)" --include='*.go' "$ROOT/internal" "$ROOT/cmd" 2>/dev/null \
  | grep -v '/internal/testkit/anthropickey/' | sort)
if [ "${#readers[@]}" -eq 0 ]; then ok; else bad "these files read the live key variables directly, use anthropickey.Lookup(os.Getenv): ${readers[*]#"$ROOT"/}"; fi

# 2. The package exists and reads all three names, the Feeder one first.
pkg="$ROOT/internal/testkit/anthropickey/anthropickey.go"
if [ -f "$pkg" ]; then ok; else bad "internal/testkit/anthropickey/anthropickey.go is missing"; fi
order="$(grep -oE '"(FEEDER_ANTHROPIC_KEY|FEEDER_LIVE_ANTHROPIC_KEY|ANTHROPIC_KEY)"' "$pkg" 2>/dev/null | tr -d '"' | awk '!s[$0]++' | paste -sd, -)"
[ "$order" = "FEEDER_ANTHROPIC_KEY,FEEDER_LIVE_ANTHROPIC_KEY,ANTHROPIC_KEY" ] && ok || bad "anthropickey must list the names in the order FEEDER_ANTHROPIC_KEY, FEEDER_LIVE_ANTHROPIC_KEY, ANTHROPIC_KEY (found: ${order:-none})"

# 3. Every live test that needs a key asks the package, handing it os.Getenv (the package never reads the environment
#    itself: scripts/test/env_drift_test.sh).
for f in internal/receipt/service/live_read_test.go internal/recipeassistant/service/live_read_test.go \
         internal/recipeassistant/claude/live_receipt_schema_test.go internal/recipeassistant/claude/live_schema_test.go \
         internal/recipeassistant/claude/live_test.go; do
  grep -q 'anthropickey\.Lookup(os\.Getenv)' "$ROOT/$f" 2>/dev/null && ok || bad "$f must read the key with anthropickey.Lookup(os.Getenv)"
done

# 4. The docs name the rule and each accepted variable, and say .env.local is loaded with set -a.
doc="$ROOT/docs/dev/live-tests.md"
if [ -f "$doc" ]; then
  for n in FEEDER_ANTHROPIC_KEY FEEDER_LIVE_ANTHROPIC_KEY ANTHROPIC_KEY FEEDER_LIVE_SCHEMA_CHECK; do
    grep -q "$n" "$doc" && ok || bad "docs/dev/live-tests.md must name $n"
  done
  grep -q 'set -a' "$doc" && ok || bad "docs/dev/live-tests.md must show loading .env.local with set -a"
else
  bad "docs/dev/live-tests.md is missing"
fi

# 5. The key is never printed: no live test or the package formats the value into a log, error or message.
mapfile -t files < <(ls "$ROOT"/internal/receipt/service/live_read_test.go "$ROOT"/internal/recipeassistant/service/live_read_test.go \
  "$ROOT"/internal/recipeassistant/claude/live*_test.go "$pkg" 2>/dev/null)
if [ "${#files[@]}" -gt 0 ] && grep -nE '(t\.(Log|Logf|Error|Errorf|Fatal|Fatalf|Skip|Skipf)|fmt\.(Print|Fprint|Sprint|Errorf)[a-z]*|log\.[A-Z][a-z]*)\([^)]*\bkey\b' "${files[@]}" >/dev/null; then
  bad "a live test or anthropickey formats the key into output: $(grep -nE '(t\.(Log|Logf|Error|Errorf|Fatal|Fatalf|Skip|Skipf)|fmt\.(Print|Fprint|Sprint|Errorf)[a-z]*|log\.[A-Z][a-z]*)\([^)]*\bkey\b' "${files[@]}" | cut -d: -f1,2 | tr '\n' ' ')"
else ok; fi

printf 'live-key-env_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
