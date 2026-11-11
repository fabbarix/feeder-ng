#!/usr/bin/env bash
# THIRD_PARTY_NOTICES.md must list every module in go.mod and every production npm dependency, each with its licence.
# Contract: docs/dev/design/rel1-deploy.md. Format: one table row per dependency, "| name | version | SPDX licence | ... |".
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
N="$ROOT/THIRD_PARTY_NOTICES.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

if [ ! -f "$N" ]; then
  bad "THIRD_PARTY_NOTICES.md is missing at the repository root"
  printf '%d passed, %d failed\n' "$PASS" "$FAIL"; exit 1
fi

SPDX='(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|MPL-2\.0|OFL-1\.1|0BSD|Unlicense|CC0-1\.0)'
row_of() { grep -F -- "| $1 " "$N" | head -1; } # table row whose first cell is the name

# 1. every go.mod require (direct and indirect), with a licence on its row.
while read -r mod ver; do
  row="$(row_of "$mod")"
  if [ -z "$row" ]; then bad "go.mod requires $mod but THIRD_PARTY_NOTICES.md has no table row for it"; continue; fi
  ok
  printf '%s' "$row" | grep -Eq -- "$SPDX" && ok || bad "the row for $mod names no SPDX licence"
  printf '%s' "$row" | grep -qF -- "$ver" && ok || bad "the row for $mod must show the go.mod version $ver"
done < <(awk '/^require \(/{r=1;next} r&&/^\)/{r=0} r&&NF>=2{print $1, $2}' "$ROOT/go.mod")

# 2. the Anthropic SDK set, with the licences verified in the module cache.
expect() { # name licence-regex
  local row; row="$(row_of "$1")"
  printf '%s' "$row" | grep -Eq -- "$2" && ok || bad "$1 must be listed as $2 (row: '${row:-missing}')"
}
expect github.com/anthropics/anthropic-sdk-go 'MIT'
expect github.com/tidwall/gjson 'MIT'
expect github.com/tidwall/sjson 'MIT'
expect github.com/tidwall/match 'MIT'
expect github.com/tidwall/pretty 'MIT'
expect github.com/buger/jsonparser 'MIT'
expect github.com/invopop/jsonschema 'MIT'
expect github.com/pb33f/ordered-map/v2 'Apache-2\.0'
expect github.com/bahlo/generic-list-go 'BSD-3-Clause'
expect github.com/standard-webhooks/standard-webhooks/libraries 'MIT'
expect golang.org/x/sync 'BSD-3-Clause'
expect go.yaml.in/yaml/v4 'MIT.*Apache-2\.0|Apache-2\.0.*MIT'
# go.yaml.in/yaml/v4 ships a NOTICE file (Apache-2.0): its text must be reproduced.
grep -Eq 'NOTICE' "$N" && ok || bad "the notices file must reproduce the go.yaml.in/yaml/v4 NOTICE text (Apache-2.0 section 4(d))"
# MPL-2.0 (hashicorp) is a file-level copyleft: the source link must be stated.
grep -Eq 'github\.com/hashicorp/go-memdb' "$N" && grep -Eqi 'MPL-2\.0' "$N" && grep -Eqi 'source (code )?(is )?(available|at)|https://github\.com/hashicorp' "$N" && ok || bad "MPL-2.0 modules (hashicorp) need a pointer to their source"

# 3. production npm dependencies (web/package.json "dependencies"; dev dependencies are not shipped).
while read -r pkg; do
  row="$(row_of "$pkg")"
  if [ -z "$row" ]; then bad "web/package.json depends on $pkg but THIRD_PARTY_NOTICES.md has no row for it"; continue; fi
  ok
  printf '%s' "$row" | grep -Eq -- "$SPDX" && ok || bad "the row for npm package $pkg names no SPDX licence"
done < <(python3 -c 'import json;print("\n".join(json.load(open("'"$ROOT"'/web/package.json"))["dependencies"]))')

# 4. structure and shipping.
grep -Eq '^## .*Go' "$N" && grep -Eq '^## .*(npm|JavaScript|Web)' "$N" && ok || bad "the notices file needs a Go section and an npm section"
grep -Fq 'THIRD_PARTY_NOTICES.md' "$ROOT/Dockerfile" && ok || bad "the Dockerfile must copy THIRD_PARTY_NOTICES.md into the image (Apache-2.0 / BSD notice obligations)"
grep -Fq 'THIRD_PARTY_NOTICES' "$ROOT/README.md" 2>/dev/null || grep -Fq 'THIRD_PARTY_NOTICES' "$ROOT/docs/dev/deploy.md" && ok || bad "deploy.md (or the README) must point at THIRD_PARTY_NOTICES.md"
[ -f "$ROOT/LICENSE" ] && ok || bad "LICENSE is missing"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
