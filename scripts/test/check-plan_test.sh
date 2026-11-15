#!/usr/bin/env bash
# The changed mode's planner (scripts/lib/check-plan.mjs): for a given list of changed files, the steps, vitest files, Go packages,
# BDD areas, page-layout routes and shell tests it selects. Reads the real tree (routes, imports, go list); starts nothing.
# check-paths: scripts/lib/check-plan.mjs scripts/lib/check-areas.mjs bdd/features
# check-paths-only
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLAN="$ROOT/scripts/lib/check-plan.mjs"
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); }
bad() {
  FAIL=$((FAIL + 1))
  printf 'FAIL: %s\n' "$1"
}
mkdir -p "$ROOT/build"
TMP="$(mktemp -d "$ROOT/build/check-plan-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# plan FILES -> sources the PLAN_* variables of that list into this shell
plan() {
  unset PLAN_WHOLE PLAN_UI PLAN_TYPECHECK PLAN_VITEST PLAN_VITEST_FILES PLAN_BUILD PLAN_LAYOUT PLAN_LAYOUT_ROUTES PLAN_LAYOUT_SCENARIOS PLAN_SHELL_LAYOUT PLAN_GO PLAN_BDD PLAN_SHELL
  node "$PLAN" --files "$1" --env "$TMP/env" >"$TMP/out" 2>&1 || bad "planner failed on $1: $(cat "$TMP/out")"
  # shellcheck disable=SC1091
  . "$TMP/env"
}
has() { grep -qw -- "$2" <<<"$1"; }

# A Pantry stylesheet: its routes (not the Shop), the CSS tests that read it, no Go.
plan web/src/features/stock/stock.css
[ "$PLAN_UI" = 1 ] && [ "$PLAN_TYPECHECK" = 1 ] && ok || bad "a web change runs the UI guards and the typecheck"
[ "$PLAN_VITEST" = related ] && ok || bad "a stylesheet runs vitest related (got $PLAN_VITEST)"
has "$PLAN_VITEST_FILES" web/src/features/sweepShopStock.css.test.ts && ok || bad "stock.css selects the test that names it (sweepShopStock.css.test.ts)"
has "$PLAN_LAYOUT_ROUTES" /pantry && ! has "$PLAN_LAYOUT_ROUTES" /shop && ok || bad "stock.css selects /pantry and not /shop (got $PLAN_LAYOUT_ROUTES)"
[ "$PLAN_LAYOUT_ROUTES" != all ] && ok || bad "a feature stylesheet does not select every route"
has "$PLAN_LAYOUT_SCENARIOS" pantry-filtered && ok || bad "/pantry brings its scenarios (pantry-filtered)"
[ -z "$PLAN_GO" ] && [ -z "$PLAN_BDD" ] && ok || bad "a stylesheet runs no Go and no BDD (go '$PLAN_GO', bdd '$PLAN_BDD')"
grep -q 'stock.css is imported by' "$TMP/out" && ok || bad "the planner says why it chose the routes"

# A Shopping handler: its package and the packages that import it, the shopping BDD areas, the Shop route, no web tests.
plan internal/shopping/httpapi/httpapi.go
has "$PLAN_GO" internal/shopping/httpapi && has "$PLAN_GO" bdd && has "$PLAN_GO" cmd/feeder && ok || bad "a handler runs its package and its importers (got $PLAN_GO)"
! has "$PLAN_GO" internal/shopping/store && ok || bad "a handler does not run the packages it imports (internal/shopping/store)"
[ "$PLAN_BDD" = "scan shopping-scan" ] && ok || bad "internal/shopping selects @area-shopping-scan and @area-scan (got '$PLAN_BDD')"
[ "$PLAN_LAYOUT_ROUTES" = /shop ] && ok || bad "internal/shopping selects /shop (got '$PLAN_LAYOUT_ROUTES')"
[ "$PLAN_VITEST" = none ] && [ "$PLAN_TYPECHECK" = 0 ] && ok || bad "a Go change runs no web tests"

# A ui/ primitive: every route, the shell layout guard, vitest related to it.
plan web/src/ui/BentoGrid.tsx
[ "$PLAN_LAYOUT_ROUTES" = all ] && [ "$PLAN_SHELL_LAYOUT" = 1 ] && ok || bad "a ui/ primitive selects every route and the shell layout guard"
has "$PLAN_VITEST_FILES" web/src/ui/BentoGrid.tsx && ok || bad "a ui/ primitive runs vitest related to itself"

# A Go test file: its package only. go.mod: everything Go.
plan internal/shopping/httpapi/restock_test.go
[ "$PLAN_GO" = internal/shopping/httpapi ] && [ -z "$PLAN_BDD" ] && [ "$PLAN_LAYOUT" = 0 ] && ok || bad "a _test.go file runs its package only (go '$PLAN_GO', bdd '$PLAN_BDD')"
plan go.mod
[ "$PLAN_GO" = all ] && [ "$PLAN_BDD" = all ] && ok || bad "go.mod runs every package and every feature"

# A feature file: its area. A step file: every feature.
plan bdd/features/tags/tags.feature
[ "$PLAN_BDD" = tags ] && has "$PLAN_GO" bdd && ok || bad "a feature file runs its @area- tag (got '$PLAN_BDD')"
plan bdd/steps_recipes_test.go
[ "$PLAN_BDD" = all ] && ok || bad "a step file runs every feature"

# The guard: every route; a scenario module: its scenarios only.
plan scripts/lib/page-layout/rules/P10-button-contrast.mjs
[ "$PLAN_LAYOUT_ROUTES" = all ] && ok || bad "a rule module selects every route"
plan scripts/lib/page-layout/scenarios/shop.mjs
[ "$PLAN_LAYOUT_ROUTES" = "" ] && has "$PLAN_LAYOUT_SCENARIOS" shop-header && ok || bad "a scenario module selects its scenarios only (routes '$PLAN_LAYOUT_ROUTES', scenarios '$PLAN_LAYOUT_SCENARIOS')"
plan scripts/test/fixtures/page-layout-seed/stock.mjs
[ "$PLAN_LAYOUT_ROUTES" = all ] && ok || bad "the seed selects every route"

# Shell tests: a changed test runs itself; a file a test names runs that test.
plan scripts/test/helm_test.sh
[ "$PLAN_SHELL" = scripts/test/helm_test.sh ] && ok || bad "a changed shell test runs itself (got '$PLAN_SHELL')"
plan .github/workflows/ci.yml
has "$PLAN_SHELL" scripts/test/workflows_test.sh && ok || bad "ci.yml runs workflows_test.sh (got '$PLAN_SHELL')"

# The check itself: the whole check.
node "$PLAN" --files scripts/check.sh --env "$TMP/env" >"$TMP/out" 2>&1
grep -q '^PLAN_WHOLE=1' "$TMP/env" && ok || bad "scripts/check.sh runs the whole check"

# --since: the plan of a real diff (HEAD against itself plus the working tree) runs without error.
node "$PLAN" --since HEAD >"$TMP/out" 2>&1 && grep -q '^check plan:' "$TMP/out" && ok || bad "--since HEAD must plan the working tree: $(head -3 "$TMP/out")"
node "$PLAN" --since no-such-ref >"$TMP/out" 2>&1
[ $? -eq 2 ] && ok || bad "an unknown ref is a usage error (exit 2)"

echo "check-plan: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
