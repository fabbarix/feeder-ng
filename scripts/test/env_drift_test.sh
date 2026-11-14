#!/usr/bin/env bash
# Fails when an environment variable the Go config reads is not represented in the Helm chart (or allowlisted
# with a reason below), or is missing from docs/dev/deploy.md. Contract: docs/dev/design/rel1-deploy.md.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
CHART="$ROOT/deploy/helm/feeder"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

# Intentionally not rendered by the chart. Every entry must still be read by the config (a stale entry fails).
# name|reason
ALLOW=(
  "FEEDER_DEV_LOGIN|passwordless dev login: must never be set in a cluster (the chart README says so)"
  "FEEDER_ADDR|fixed at :8080: container port, Service and probes are hardcoded; the image sets the same default"
  "FEEDER_DATA_DIR|fixed at /data: the volume mount is hardcoded; the image sets the same default"
)
allowed() { local e; for e in "${ALLOW[@]}"; do [ "${e%%|*}" = "$1" ] && return 0; done; return 1; }

# Names read by internal/config: os.Getenv("X"), os.LookupEnv("X"), or the injected getenv("X")/lookup("X").
mapfile -t VARS < <(grep -hoE '(os\.Getenv|os\.LookupEnv|getenv|lookupEnv|lookup)\("[A-Z][A-Z0-9_]*"\)' \
  $(find "$ROOT/internal/config" -name '*.go' ! -name '*_test.go') | sed -E 's/.*\("([A-Z0-9_]+)"\)/\1/' | sort -u)

if [ "${#VARS[@]}" -lt 8 ]; then bad "parsed only ${#VARS[@]} variables from internal/config (parser broken?): ${VARS[*]}"; fi
for must in FEEDER_ADMIN_EMAIL FEEDER_BASE_URL FEEDER_GOOGLE_CLIENT_ID FEEDER_GOOGLE_CLIENT_SECRET FEEDER_TRUST_PROXY FEEDER_SECRET_KEY FEEDER_DATA_DIR FEEDER_ADDR FEEDER_DEV_LOGIN; do
  grep -qx -- "$must" <<<"$(printf '%s\n' "${VARS[@]}")" && ok || bad "the parser did not find $must in internal/config"
done

# Reading the environment anywhere else would escape this guard.
if grep -rnE 'os\.(Getenv|LookupEnv|Environ)\(' "$ROOT/internal" "$ROOT/cmd" --include='*.go' \
     | grep -v '_test.go' | grep -v '^[^:]*internal/config/' | grep -q .; then
  bad "environment variables must be read in internal/config only (found os.Getenv/LookupEnv elsewhere)"
else ok; fi

# Test-only helpers (internal/testkit, e.g. anthropickey, which takes os.Getenv from its _test.go callers) must never
# reach the binary: a getenv handed to them from non-test code would read the environment past internal/config.
if ! command -v go >/dev/null; then bad "go is needed to check that the binary does not link internal/testkit"
elif deps="$(cd "$ROOT" && go list -buildvcs=false -deps ./cmd/... 2>&1)"; then
  leaked="$(grep '/internal/testkit' <<<"$deps" | paste -sd' ' -)"
  [ -z "$leaked" ] && ok || bad "test-only packages are linked into the binary (import them from _test.go files only): $leaked"
else bad "go list -deps ./cmd/... failed: $deps"; fi
# The same, file by file: no non-test file outside internal/testkit imports it.
importers="$(grep -rlE '"[^"]*/internal/testkit(/[^"]*)?"' "$ROOT/internal" "$ROOT/cmd" --include='*.go' \
  | grep -v '_test.go' | grep -v '/internal/testkit/' | sed "s|^$ROOT/||" | paste -sd' ' -)"
[ -z "$importers" ] && ok || bad "non-test files import internal/testkit (test-only): $importers"

TEMPLATES="$(cat "$CHART"/templates/*.yaml "$CHART"/templates/*.tpl 2>/dev/null)"
DEPLOY="$(cat "$ROOT/docs/dev/deploy.md")"
for v in "${VARS[@]}"; do
  if allowed "$v"; then
    if grep -q -- "name: $v\$" <<<"$TEMPLATES"; then bad "$v is allowlisted as not rendered, but the chart sets it: remove it from the allowlist"; else ok; fi
  else
    grep -Eq -- "name: $v\$" <<<"$TEMPLATES" && ok || bad "$v is read by internal/config but the chart does not set it (add it to deploy/helm/feeder/templates/deployment.yaml, or allowlist it in this test with a reason)"
    grep -q "$v" "$CHART/README.md" && ok || bad "$v is not documented in deploy/helm/feeder/README.md"
  fi
  grep -qF -- "\`$v\`" <<<"$DEPLOY" && ok || bad "$v is not in the docs/dev/deploy.md environment table"
done
for e in "${ALLOW[@]}"; do
  n="${e%%|*}"
  grep -qx -- "$n" <<<"$(printf '%s\n' "${VARS[@]}")" && ok || bad "allowlist entry $n is no longer read by internal/config: remove it"
done

# Secrets must come from a Secret, never a plain env value.
for v in FEEDER_SECRET_KEY FEEDER_GOOGLE_CLIENT_SECRET FEEDER_GOOGLE_CLIENT_ID; do
  if grep -A2 "name: $v\$" "$CHART/templates/deployment.yaml" | grep -q 'valueFrom'; then ok; else bad "$v must be set with valueFrom.secretKeyRef in the Deployment"; fi
done

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
