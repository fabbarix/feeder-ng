#!/usr/bin/env bash
# Guards the CI and release workflows against rot: they are never run in this
# repository's checks, so assert the properties that matter by reading them.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WF="$HERE/../../.github/workflows"
PASS=0; FAIL=0

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has()  { grep -Eq -- "$2" "$1" && ok || bad "$3"; }
lacks() { grep -Eq -- "$2" "$1" && bad "$3" || ok; }

CI="$WF/ci.yml"
REL="$WF/release.yml"

[ -f "$CI" ]  || bad "ci.yml is missing"
[ -f "$REL" ] || bad "release.yml is missing"

# CI: runs on pull requests and calls the one check script.
has "$CI" '^\s*pull_request:' "ci.yml must run on pull_request"
has "$CI" 'scripts/check\.sh' "ci.yml must run scripts/check.sh"
has "$CI" '^permissions:' "ci.yml must declare permissions"
lacks "$CI" 'packages:\s*write' "ci.yml must not get packages: write"

# Release: tag trigger, both architectures, GHCR, least-privilege token.
has "$REL" 'tags:\s*\["v\*"\]' "release.yml must trigger on v* tags"
has "$REL" 'platforms:\s*linux/amd64,linux/arm64' "release.yml must build linux/amd64 and linux/arm64"
has "$REL" 'docker/setup-buildx-action' "release.yml must use buildx"
has "$REL" 'docker/setup-qemu-action' "release.yml must set up QEMU for arm64"
has "$REL" 'registry:\s*ghcr\.io' "release.yml must log in to ghcr.io"
has "$REL" 'secrets\.GITHUB_TOKEN' "release.yml must log in with GITHUB_TOKEN"
has "$REL" 'packages:\s*write' "release.yml needs packages: write for the image job"
has "$REL" 'push:\s*true' "release.yml must push the image"
has "$REL" 'needs:\s*check' "release.yml must gate the image on the checks"
lacks "$REL" 'pull_request' "release.yml must not run on pull requests"
lacks "$REL" '(PAT|personal)' "release.yml must not use a personal access token"

# D1: publish on main and on tags; PRs build without pushing.
has "$REL" 'branches:\s*\[main\]' "release.yml must also trigger on pushes to main"
has "$CI"  'branches:\s*\[main\]' "ci.yml must run on pushes to main"
has "$REL" 'type=raw,value=main|type=ref,event=branch' "release.yml must tag main pushes as main"
has "$REL" 'type=sha' "release.yml must add a sha-<short> tag"
has "$REL" 'prefix=sha-' "the sha tag must be prefixed sha-"
has "$REL" "type=raw,value=latest,enable=.*refs/tags/v" "latest must be enabled only for v* tags"
has "$REL" 'org\.opencontainers\.image\.source' "release.yml must set org.opencontainers.image.source"
has "$REL" 'cache-from:\s*type=gha' "release.yml must read the GHA cache"
has "$REL" 'cache-to:\s*type=gha' "release.yml must write the GHA cache"
has "$REL" 'docker/metadata-action' "release.yml must use metadata-action"
has "$REL" 'docker/build-push-action' "release.yml must use build-push-action"
lacks "$REL" 'push:\s*false' "release.yml must not have a non-pushing build (that is ci.yml's job)"
# The PR build never pushes and never logs in.
has "$CI"  'docker/build-push-action' "ci.yml must build the image on pull requests"
has "$CI"  'push:\s*false' "ci.yml's image build must not push"
has "$CI"  "github\.event_name\s*==\s*'pull_request'" "ci.yml's image build must be limited to pull requests"
lacks "$CI" 'docker/login-action' "ci.yml must not log in to a registry"
# Chart job: only on v* tags, pushes to the owner's charts namespace on GHCR.
has "$REL" '^\s*chart:' "release.yml must have a chart job"
has "$REL" "if:\s*startsWith\(github\.ref,\s*'refs/tags/v'\)" "the chart job must run only on v* tags"
has "$REL" 'helm package deploy/helm/feeder' "the chart job must helm package deploy/helm/feeder"
has "$REL" '--version' "helm package must set --version from the tag"
has "$REL" '--app-version' "helm package must set --app-version from the tag"
has "$REL" 'helm push .*oci://ghcr\.io/.*/charts' "the chart job must helm push to oci://ghcr.io/<owner>/charts"
has "$REL" 'helm registry login ghcr\.io' "the chart job must log in to ghcr.io"

# Review fixes: the chart is published only after the image, from one tag-derived version.
python3 - "$REL" <<'PY' && ok || bad "the chart job must declare needs: image"
import sys, re
t = open(sys.argv[1]).read()
m = re.search(r"^  chart:\n(.*?)(?=^  \w[\w-]*:\n|\Z)", t, re.S | re.M)
sys.exit(0 if m and re.search(r"needs:\s*(\[?\s*image\s*\]?|\n\s*-\s*image)", m.group(1)) else 1)
PY
VERS="$(grep -Eo '\-\-version[ =]+\S+' "$REL" | head -1 | sed -E 's/--version[ =]+//')"
APPV="$(grep -Eo '\-\-app-version[ =]+\S+' "$REL" | head -1 | sed -E 's/--app-version[ =]+//')"
if [ -n "$VERS" ] && [ "$VERS" = "$APPV" ]; then ok; else bad "--version and --app-version must use the same tag-derived value (got '$VERS' / '$APPV')"; fi
has "$REL" 'TAG:\s*\$\{\{\s*github\.ref_name' "TAG must come from github.ref_name"
has "$REL" 'VERSION="?\$\{TAG#v\}' "VERSION must be the tag without the leading v"
has "$REL" '--password-stdin' "helm registry login must read the token with --password-stdin"
# Each publishing job declares its own permissions; the workflow default stays read-only.
if [ "$(grep -Ec '^\s+packages:\s*write' "$REL")" -ge 2 ]; then ok; else bad "release.yml: image and chart jobs each need packages: write"; fi
has "$REL" '^permissions:\s*$' "release.yml must declare top-level permissions"

# YAML syntax, when python yaml is available.
if python3 -c 'import yaml' >/dev/null 2>&1; then
  for f in "$CI" "$REL"; do
    python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' "$f" 2>/dev/null && ok || bad "$(basename "$f") is not valid YAML"
  done
else
  echo "note: python yaml missing, skipping YAML syntax checks"
fi

# No secrets or credentials written into either file.
lacks "$CI"  '(ghp_|password:\s*[^$ ])' "ci.yml contains a literal credential"
lacks "$REL" '(ghp_|password:\s*[^$ ])' "release.yml contains a literal credential"

# Every action is pinned to a full commit SHA with its tag in a comment.
for f in "$CI" "$REL"; do
  if grep -E 'uses:' "$f" | grep -Ev '@[0-9a-f]{40} # v[0-9]' >/dev/null; then
    bad "$(basename "$f") has an action not pinned to a full commit SHA"
  else
    ok
  fi
done

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
