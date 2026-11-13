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

# D1: PRs build without pushing. D2: publishing happens on v* tags only.
lacks "$CI" '^\s*push:\s*$' "ci.yml must not run on pushes (main is not checked; v* tags run release.yml)"
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
# D2: publish only tagged versions. No branch trigger, no main/sha image tags, no manual or scheduled runs.
lacks "$REL" '^\s*branches(-ignore)?:' "release.yml must have no branch push trigger (tags only)"
lacks "$REL" 'refs/heads/' "release.yml must not refer to branch refs"
lacks "$REL" 'type=ref,event=(branch|pr)' "release.yml must not tag images from branches or PRs"
lacks "$REL" 'type=raw,value=main' "release.yml must not publish a main image tag"
lacks "$REL" 'type=sha|prefix=sha-' "release.yml must not publish sha-<short> tags (semver tags only)"
lacks "$REL" '^\s*(workflow_dispatch|schedule|workflow_run):' "release.yml runs on v* tags only (re-run a failed release from the Actions UI)"
lacks "$REL" '^# .*(Pushes to main|push(es)? to main)' "release.yml header must not say main pushes publish"
has "$REL" '^# .*(only|just).*v\*' "release.yml header must say it publishes v* tags only"
has "$REL" 'type=semver,pattern=\{\{version\}\}' "release.yml must publish the exact semver tag"
# every tags: rule in release.yml is a semver or latest rule enabled for tags
if grep -E '^\s+type=' "$REL" | grep -Ev 'enable=.*refs/tags/v' >/dev/null; then bad "every image tag rule must be enabled only for v* tags"; else ok; fi
# ci.yml: checks only on pull requests; never publishes.
has "$CI" '^\s*pull_request:' "ci.yml must still run on pull_request"
lacks "$CI" 'push:\s*true' "ci.yml must never push an image"
lacks "$CI" 'registry:|ghcr\.io' "ci.yml must not touch a registry"
lacks "$CI" 'helm (push|registry)' "ci.yml must not publish a chart"
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

# REL-1: a dotted prerelease tag (v1.0.0-beta.1, v1.0.0-rc.2) publishes image {{version}} and chart 1.0.0-beta.1, never latest,
# and never moves the floating 1.0 / 1 tags (they must name stable releases only; do not rely on metadata-action's default).
python3 - "$REL" <<'PY' && ok || bad "release.yml: 1.0 and 1 floating tags and latest must all be disabled for tags containing '-' (prereleases)"
import re, sys
t = open(sys.argv[1]).read()
lines = [l for l in t.splitlines() if "type=semver" in l or "type=raw,value=latest" in l]
mm = [l for l in lines if "{{major}}" in l]
ok = len(mm) == 2 and all("!contains(github.ref_name, '-')" in l for l in mm)
lat = [l for l in lines if "value=latest" in l]
ok = ok and len(lat) == 1 and "!contains(github.ref_name, '-')" in lat[0]
ver = [l for l in lines if "pattern={{version}}" in l]
ok = ok and len(ver) == 1 and "contains(github.ref_name, '-')" not in ver[0]
sys.exit(0 if ok else 1)
PY
# Version derivation for the chart job: v1.0.0-beta.1 -> 1.0.0-beta.1 (valid semver, no build metadata, same for --version and --app-version).
for tag in v1.0.0 v1.0.0-dev v1.0.0-beta.1 v1.0.0-rc.2; do
  ver="${tag#v}"
  if printf '%s' "$ver" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$'; then ok; else bad "tag $tag does not map to a valid chart version ($ver)"; fi
done
# The sorting rule the docs state: only stable tags (no '-') may set latest.
for tag in v1.0.0-dev v1.0.0-beta.1 v1.0.0-rc.2; do case "$tag" in *-*) ok ;; *) bad "$tag must count as a prerelease" ;; esac; done
has "$REL" 'VERSION="?\$\{TAG#v\}' "VERSION must be the tag without the leading v"
# the image job must also be gated on the same tag filter used by the chart job
has "$REL" "refs/tags/v" "release.yml must filter on refs/tags/v"

# One Go toolchain version everywhere: go.mod, CI/release (via go-version-file) and the Dockerfile builder.
GOVER="1.26.11"
GOMOD="$HERE/../../go.mod"
DOCKERFILE="$HERE/../../Dockerfile"
has "$GOMOD" "^go ${GOVER//./\\.}\$" "go.mod go directive is not ${GOVER}"
if grep -Eq '^toolchain ' "$GOMOD"; then
  has "$GOMOD" "^toolchain go${GOVER//./\\.}\$" "go.mod toolchain line is not go${GOVER}"
else
  ok
fi
has "$CI"  'go-version-file:\s*go\.mod' "ci.yml setup-go must read the Go version from go.mod"
has "$REL" 'go-version-file:\s*go\.mod' "release.yml setup-go must read the Go version from go.mod"
lacks "$CI"  '^\s*go-version:' "ci.yml pins a literal go-version instead of go.mod"
lacks "$REL" '^\s*go-version:' "release.yml pins a literal go-version instead of go.mod"
has "$DOCKERFILE" "^FROM .*golang:${GOVER//./\\.}([-@ ]|\$)" "Dockerfile builder image is not golang:${GOVER}"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
