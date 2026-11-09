#!/usr/bin/env bash
# Runs every check for this worktree, in order, and stops at the first failure.
# Output is teed to <worktree>/build/check.log. Exits non-zero on any failure.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
mkdir -p build
LOG="$ROOT/build/check.log"
: >"$LOG"

step() {
  local name="$1"
  shift
  printf '\n==> %s\n' "$name" | tee -a "$LOG"
  "$@" 2>&1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ]; then
    printf 'CHECK FAILED: %s (exit %s)\n' "$name" "$rc" | tee -a "$LOG"
    exit "$rc"
  fi
}

step "pnpm install (frozen lockfile)" pnpm -C web install --frozen-lockfile
step "typecheck" pnpm -C web typecheck
step "vitest" pnpm -C web test
step "vite build" pnpm -C web build
step "go vet" go vet ./...
step "go test" go test ./...

# Every scripts/test/*_test.sh runs; the step fails if any of them fails.
run_shell_tests() {
  local status=0 f
  local tests=()
  shopt -s nullglob
  tests=("$ROOT"/scripts/test/*_test.sh)
  shopt -u nullglob
  if [ "${#tests[@]}" -eq 0 ]; then
    echo "no scripts/test/*_test.sh files"
    return 0
  fi
  for f in "${tests[@]}"; do
    printf -- '--> %s\n' "${f#"$ROOT"/}"
    if ! bash "$f"; then
      printf 'FAILED: %s\n' "${f#"$ROOT"/}"
      status=1
    fi
  done
  return "$status"
}

step "shell tests (scripts/test)" run_shell_tests

printf '\nCHECK PASSED\n' | tee -a "$LOG"
