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

# No secrets or credentials written into either file.
lacks "$CI"  '(ghp_|password:\s*[^$ ])' "ci.yml contains a literal credential"
lacks "$REL" '(ghp_|password:\s*[^$ ])' "release.yml contains a literal credential"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
