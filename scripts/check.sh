#!/usr/bin/env bash
# Runs every check for this worktree, in order, and stops at the first failure.
# Output is teed to <worktree>/build/check.log. Exits non-zero on any failure.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
mkdir -p build

# One check per worktree (b5-pl): flock -n on build/check.lock, held on fd 8 for this script's whole life. It is taken BEFORE the log is
# truncated, so a refused run leaves the first run's check.log alone. The kernel drops the lock when the holder dies (no stale-lock handling).
# fd 8 is closed in every child (`8>&-`), so nothing this run starts can keep the lock after it has gone. The wrapper's own lock is
# build/page-layout.lock (fd 9), a different file, so the page-layout step never blocks on this one.
if ! { exec 8>"$ROOT/build/check.lock" && flock -n 8; }; then
  echo "check.sh FAILED: another check is already running in this worktree (lock $ROOT/build/check.lock is held); not run" >&2
  exit 1
fi

LOG="$ROOT/build/check.log"
: >"$LOG"

step() {
  local name="$1"
  shift
  printf '\n==> %s\n' "$name" | tee -a "$LOG"
  "$@" 8>&- 2>&1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ]; then
    printf 'CHECK FAILED: %s (exit %s)\n' "$name" "$rc" | tee -a "$LOG"
    exit "$rc"
  fi
}

# UI guards first: they are instant. Each rule's mode lives in scripts/check-ui.rules.
step "UI guards (scripts/check-ui.sh)" bash "$ROOT/scripts/check-ui.sh"
if [ "${CHECK_ONLY:-}" = ui ]; then # used by scripts/test/check-ui_test.sh
  printf '\nCHECK PASSED (ui guards only)\n' | tee -a "$LOG"
  exit 0
fi

step "pnpm install (frozen lockfile)" pnpm -C web install --frozen-lockfile
step "typecheck" pnpm -C web typecheck
step "vitest" pnpm -C web test
step "vite build" pnpm -C web build
# Page-layout guard (R2-L): a route x viewport that is not inspected, or a refused run (a concurrent one), fails the run in every mode.
# Rule findings are WARN until a route is flipped in scripts/check-page-layout.modes. Missing Chrome or a missing frontend (the 503 'frontend not built' page) is a WARN here; a failed vite build already failed at the vite step above.
# PAGE_LAYOUT=skip skips it, PAGE_LAYOUT=full runs all six viewports and fails on any guard that did not run (default: quick profile).
step "page layout guard" bash "$ROOT/scripts/check-page-layout.sh"
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
    if ! bash "$f" 8>&-; then
      printf 'FAILED: %s\n' "${f#"$ROOT"/}"
      status=1
    fi
  done
  return "$status"
}

step "shell tests (scripts/test)" run_shell_tests

printf '\nCHECK PASSED\n' | tee -a "$LOG"
