#!/usr/bin/env bash
# Guards the build: the web build's tsc must skip tests (the image has no testdata outside web/),
# and the Go build must not need VCS state (it fails in linked git worktrees otherwise).
# `docker build` itself is not run here (slow, needs network): see docs/dev/design/r2-build.md.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

TSB="$ROOT/web/tsconfig.build.json"
[ -f "$TSB" ] || bad "web/tsconfig.build.json is missing"
has "$TSB" '"extends"[[:space:]]*:[[:space:]]*"\./tsconfig\.json"' "tsconfig.build.json must extend tsconfig.json"
has "$TSB" '"exclude"' "tsconfig.build.json must have an exclude list"
has "$TSB" '\*\.test\.ts"' "tsconfig.build.json must exclude *.test.ts"
has "$TSB" '\*\.test\.tsx"' "tsconfig.build.json must exclude *.test.tsx"

# The build script uses it; the typecheck script still covers tests.
has "$ROOT/web/package.json" '"build": "tsc --noEmit -p tsconfig\.build\.json && vite build"' "the build script must type-check with tsconfig.build.json"
has "$ROOT/web/package.json" '"typecheck": "tsc --noEmit"' "the typecheck script must keep using the full tsconfig.json"
grep -Eq '"(include|exclude)"[^]]*test' "$ROOT/web/tsconfig.json" && bad "tsconfig.json must not exclude tests"

# The type-check really skips tests: list the files the build config compiles.
if command -v pnpm >/dev/null && [ -d "$ROOT/web/node_modules" ]; then
  files="$(cd "$ROOT/web" && pnpm exec tsc -p tsconfig.build.json --listFilesOnly 2>/dev/null | grep -v node_modules)"
  if [ -z "$files" ]; then bad "tsc --listFilesOnly returned nothing"
  elif printf '%s\n' "$files" | grep -Eq '\.test\.tsx?$'; then bad "tsc -p tsconfig.build.json still compiles test files"
  else ok; fi
fi

# Go build flags.
has "$ROOT/Makefile" 'go build|\$\(GO\) build' "Makefile has no go build"
grep -E '\$\(GO\) build' "$ROOT/Makefile" | grep -q -- '-buildvcs=false' && ok || bad "Makefile go build must pass -buildvcs=false"
grep -E 'go build' "$ROOT/Dockerfile" | grep -q -- '-buildvcs=false' && ok || bad "Dockerfile go build must pass -buildvcs=false"

# BuildKit is documented and make docker uses it.
has "$ROOT/Makefile" '^docker:' "Makefile needs a docker target"
grep -A2 '^docker:' "$ROOT/Makefile" | grep -Eq 'DOCKER_BUILDKIT=1|buildx build' && ok || bad "make docker must use BuildKit"
has "$ROOT/docs/dev/deploy.md" 'BuildKit' "deploy.md must document the BuildKit requirement"
grep -Eq '^COPY .*testdata' "$ROOT/Dockerfile" && bad "Dockerfile must not copy testdata into the image"

# The Go build works here, which may be a linked worktree (the original failure).
if command -v go >/dev/null; then
  out="$(mktemp -d)"
  (cd "$ROOT" && go build -buildvcs=false -o "$out/feeder" ./cmd/feeder) >"$out/log" 2>&1 \
    && ok || { bad "go build -buildvcs=false ./cmd/feeder failed: $(head -3 "$out/log")"; }
  rm -rf "$out"
fi

printf 'build_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
