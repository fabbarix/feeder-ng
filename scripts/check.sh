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

printf '\nCHECK PASSED\n' | tee -a "$LOG"
