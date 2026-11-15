#!/usr/bin/env bash
# Runs every check for this worktree, in order, and stops at the first failure.
# Output is teed to <worktree>/build/check.log. Exits non-zero on any failure. How to run which: docs/dev/checks.md.
#
# CHECK_PROFILE  full (the default): every step. This is the check to run locally before a tag.
#                ci: the fast safety net the workflows run. It skips the headless-Chrome work: the page layout guard, the shell layout guard and the
#                shell tests marked `# check-profile: browser` (the ones that start Chrome; workflows_test.sh keeps the marks honest).
# CHECK_SINCE    a git ref: the changed mode. Only the steps, tests, packages and routes that the files changed since the ref's merge base
#                (committed, staged, unstaged, untracked) can affect run (scripts/lib/check-plan.mjs prints what it chose and why). It narrows
#                the profile: CHECK_PROFILE=ci CHECK_SINCE=main leaves the browser work out too. Unset: the profile's full coverage.
# CHECK_ONLY     ui: the UI guards only (scripts/test/check-ui_test.sh).
#                web: the UI guards, pnpm install, typecheck, vitest and the vite build (the workflows' web job).
#                go: pnpm install (the shell tests run vite), go vet, go test and the shell tests (the workflows' Go and shell job).
#                Unset: every step of the profile.
# CHECK_LIST=1   prints the steps (and the shell tests) this run would take, runs nothing and leaves the lock and the log alone.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

PROFILE="${CHECK_PROFILE:-full}"
ONLY="${CHECK_ONLY:-}"
LIST="${CHECK_LIST:-}"
SINCE="${CHECK_SINCE:-}"
case "$PROFILE" in full | ci) ;; *) echo "check.sh FAILED: unknown CHECK_PROFILE '$PROFILE' (full or ci)" >&2; exit 2 ;; esac
case "$ONLY" in "" | ui | web | go) ;; *) echo "check.sh FAILED: unknown CHECK_ONLY '$ONLY' (ui, web or go)" >&2; exit 2 ;; esac

# wants PART -> true when this run includes the steps of PART (ui, web, layout, go, shell)
wants() {
  case "$1" in
    layout) [ "$PROFILE" = full ] && [ -z "$ONLY" ] ;;
    ui) [ -z "$ONLY" ] || [ "$ONLY" = ui ] || [ "$ONLY" = web ] ;;
    web) [ -z "$ONLY" ] || [ "$ONLY" = web ] ;;
    install) [ -z "$ONLY" ] || [ "$ONLY" = web ] || [ "$ONLY" = go ] ;;
    go | shell) [ -z "$ONLY" ] || [ "$ONLY" = go ] ;;
  esac
}

# The changed mode: the plan (PLAN_* variables) for the files changed since $SINCE. A plan that says the check itself changed
# (PLAN_WHOLE=1) runs the profile's full coverage.
CHANGED=""
PLAN_TEXT=""
if [ -n "$SINCE" ]; then
  [ -n "$LIST" ] || mkdir -p build
  PLAN_ENV="$ROOT/build/check-plan.env"
  [ -n "$LIST" ] && PLAN_ENV="$(mktemp)"
  if ! PLAN_TEXT="$(node "$ROOT/scripts/lib/check-plan.mjs" --since "$SINCE" --env "$PLAN_ENV" 2>&1)"; then
    echo "check.sh FAILED: CHECK_SINCE=$SINCE: $PLAN_TEXT" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  . "$PLAN_ENV"
  [ -n "$LIST" ] && rm -f "$PLAN_ENV"
  [ "${PLAN_WHOLE:-0}" = 1 ] || CHANGED=1
fi
# plans PART -> true when the changed mode's plan selects PART (always true outside the changed mode)
plans() {
  [ -z "$CHANGED" ] && return 0
  case "$1" in
    ui) [ "$PLAN_UI" = 1 ] ;;
    typecheck) [ "$PLAN_TYPECHECK" = 1 ] ;;
    vitest) [ "$PLAN_VITEST" != none ] ;;
    build) [ "$PLAN_BUILD" = 1 ] ;;
    layout) [ "$PLAN_LAYOUT" = 1 ] ;;
    shell-layout) [ "$PLAN_SHELL_LAYOUT" = 1 ] ;;
    go) [ -n "$PLAN_GO" ] ;;
    shell) [ -n "$PLAN_SHELL" ] ;;
    install) [ "$PLAN_TYPECHECK" = 1 ] || [ "$PLAN_VITEST" != none ] || [ "$PLAN_BUILD" = 1 ] || [ -n "$PLAN_SHELL" ] ;;
  esac
}

# The shell tests this profile runs: every scripts/test/*_test.sh; the ci profile leaves out the ones marked as browser tests; the
# changed mode keeps only the plan's.
SHELL_TESTS=()
shopt -s nullglob
for f in "$ROOT"/scripts/test/*_test.sh; do
  if [ "$PROFILE" = ci ] && grep -q '^# check-profile: browser' "$f"; then continue; fi
  if [ -n "$CHANGED" ] && ! grep -qw -- "${f#"$ROOT"/}" <<<"$PLAN_SHELL"; then continue; fi
  SHELL_TESTS+=("$f")
done
shopt -u nullglob

if [ -n "$LIST" ]; then
  printf 'check.sh steps (CHECK_PROFILE=%s%s%s):\n' "$PROFILE" "${ONLY:+, CHECK_ONLY=$ONLY}" "${SINCE:+, CHECK_SINCE=$SINCE}"
  [ -n "$SINCE" ] && printf '%s\n' "$PLAN_TEXT"
else
  mkdir -p build
fi

# One check per worktree (b5-pl): flock -n on build/check.lock, held on fd 8 for this script's whole life. It is taken BEFORE the log is
# truncated, so a refused run leaves the first run's check.log alone. The kernel drops the lock when the holder dies (no stale-lock handling).
# fd 8 is closed in every child (`8>&-`), so nothing this run starts can keep the lock after it has gone. The wrapper's own lock is
# build/page-layout.lock (fd 9), a different file, so the page-layout step never blocks on this one.
if [ -z "$LIST" ] && ! { exec 8>"$ROOT/build/check.lock" && flock -n 8; }; then
  echo "check.sh FAILED: another check is already running in this worktree (lock $ROOT/build/check.lock is held); not run" >&2
  exit 1
fi

LOG="$ROOT/build/check.log"
[ -n "$LIST" ] || : >"$LOG"
[ -z "$LIST" ] && [ -n "$SINCE" ] && printf '%s\n' "$PLAN_TEXT" | tee -a "$LOG"
CHECK_START=$SECONDS

step() {
  local name="$1"
  shift
  if [ -n "$LIST" ]; then
    printf '==> %s\n' "$name"
    return 0
  fi
  printf '\n==> %s\n' "$name" | tee -a "$LOG"
  local t0=$SECONDS
  "$@" 8>&- 2>&1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ]; then
    printf 'CHECK FAILED: %s (exit %s, %ss)\n' "$name" "$rc" "$((SECONDS - t0))" | tee -a "$LOG"
    exit "$rc"
  fi
  printf '<== %s: %ss\n' "$name" "$((SECONDS - t0))" | tee -a "$LOG"
}

# vitest: every file, or (changed mode) `vitest related` on the plan's files: the tests that import them, and the tests that read them.
run_vitest() {
  if [ -z "$CHANGED" ] || [ "$PLAN_VITEST" = all ]; then
    pnpm -C web test
    return
  fi
  local files=() f
  for f in $PLAN_VITEST_FILES; do files+=("$ROOT/$f"); done
  echo "vitest related: ${#files[@]} file(s)"
  pnpm -C web exec vitest related --run --passWithNoTests "${files[@]}"
}

# go vet and go test: every package, or (changed mode) the plan's packages and the packages that import them.
go_packages() {
  if [ -z "$CHANGED" ] || [ "$PLAN_GO" = all ]; then
    echo ./...
    return
  fi
  local d
  for d in $PLAN_GO; do echo "./$d"; done
}
run_go_vet() {
  # shellcheck disable=SC2046
  go vet $(go_packages)
}
run_go_test() {
  # shellcheck disable=SC2046
  go test $(go_packages)
}

# UI guards first: they are instant. Each rule's mode lives in scripts/check-ui.rules.
if wants ui && plans ui; then step "UI guards (scripts/check-ui.sh)" bash "$ROOT/scripts/check-ui.sh"; fi
if [ "$ONLY" = ui ]; then # used by scripts/test/check-ui_test.sh
  [ -n "$LIST" ] && exit 0
  printf '\nCHECK PASSED (ui guards only)\n' | tee -a "$LOG"
  exit 0
fi

if wants install && plans install; then step "pnpm install (frozen lockfile)" pnpm -C web install --frozen-lockfile; fi
if wants web && plans typecheck; then step "typecheck" pnpm -C web typecheck; fi
if wants web && plans vitest; then step "vitest" run_vitest; fi
if wants web && plans build; then step "vite build" pnpm -C web build
  step "bundle budget" bash scripts/check-bundle-budget.sh
fi
# Page-layout guard (R2-L): a route x viewport that is not inspected, or a refused run (a concurrent one), fails the run in every mode.
# Rule findings are WARN until a route is flipped in scripts/check-page-layout.modes. Missing Chrome or a missing frontend (the 503 'frontend not built' page) is a WARN here; a failed vite build already failed at the vite step above.
# PAGE_LAYOUT=skip skips it, PAGE_LAYOUT=full runs all six viewports and fails on any guard that did not run (default: quick profile).
# Full profile only: the ci profile leaves it out (it is the slowest step, and every release tag runs the full check locally first).
# The changed mode runs only the routes and scenarios the diff can affect (--changed-since).
LAYOUT_ARGS=()
[ -n "$CHANGED" ] && LAYOUT_ARGS=(--changed-since "$SINCE")
if wants layout && plans layout; then step "page layout guard" bash "$ROOT/scripts/check-page-layout.sh" "${LAYOUT_ARGS[@]}"; fi
# int1: the shell guard (bottom bar, rails, wide screens; scripts/check-shell-layout.mjs) against a production build, on its own server.
if wants layout && plans shell-layout; then step "shell layout guard" bash "$ROOT/scripts/check-shell-layout.sh"; fi
if wants go && plans go; then
  step "go vet" run_go_vet
  step "go test" run_go_test
fi

# Every shell test of the profile runs (SHELL_TESTS); the step fails if any of them fails.
run_shell_tests() {
  local status=0 f
  if [ "${#SHELL_TESTS[@]}" -eq 0 ]; then
    echo "no scripts/test/*_test.sh files"
    return 0
  fi
  for f in "${SHELL_TESTS[@]}"; do
    printf -- '--> %s\n' "${f#"$ROOT"/}"
    if ! bash "$f" 8>&-; then
      printf 'FAILED: %s\n' "${f#"$ROOT"/}"
      status=1
    fi
  done
  return "$status"
}

if wants shell && plans shell; then
  if [ "$PROFILE" = ci ]; then
    step "shell tests (scripts/test, no browser tests)" run_shell_tests
  else
    step "shell tests (scripts/test)" run_shell_tests
  fi
  if [ -n "$LIST" ]; then
    for f in "${SHELL_TESTS[@]}"; do printf -- '    --> %s\n' "${f#"$ROOT"/}"; done
  fi
fi

[ -n "$LIST" ] && exit 0
if [ "$PROFILE" = full ] && [ -z "$ONLY" ] && [ -z "$CHANGED" ]; then
  printf '\nCHECK PASSED (%ss)\n' "$((SECONDS - CHECK_START))" | tee -a "$LOG"
else
  printf '\nCHECK PASSED (CHECK_PROFILE=%s%s%s, %ss)\n' "$PROFILE" "${ONLY:+, CHECK_ONLY=$ONLY}" "${CHANGED:+, CHECK_SINCE=$SINCE}" "$((SECONDS - CHECK_START))" | tee -a "$LOG"
fi
