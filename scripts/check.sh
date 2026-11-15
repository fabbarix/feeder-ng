#!/usr/bin/env bash
# Runs every check for this worktree and fails if any fails. The web steps run in order and stop at the first failure; after the
# web build, two phases of steps run side by side (each into its own log under build/check-steps/): the page layout and shell layout
# guards with go vet, go test and the release preflight, then the BDD suite with the shell tests. A phase fails once all its steps
# have finished if any of them failed.
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
#                go: pnpm install (the shell tests run vite), go vet, go test, the release preflight and the shell tests (the workflows' Go and
#                shell job).
#                Unset: every step of the profile.
# CHECK_SERIAL=1 runs the steps one after the other (as before fast-checks), to read one step's output as it comes.
# CHECK_LIST=1   prints the steps (and the shell tests) this run would take, runs nothing and leaves the lock and the log alone.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

PROFILE="${CHECK_PROFILE:-full}"
ONLY="${CHECK_ONLY:-}"
LIST="${CHECK_LIST:-}"
SINCE="${CHECK_SINCE:-}"
SERIAL="${CHECK_SERIAL:-}"
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
    bdd) [ -n "$PLAN_BDD" ] ;;
    shell) [ -n "$PLAN_SHELL" ] ;;
    # The release preflight is cheap and guards what no diff shows (a file only this checkout has): it runs whenever Go runs.
    preflight) [ -n "$PLAN_GO" ] ;;
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
  SHELL_TESTS+=("${f#"$ROOT"/}")
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
STEPS="$ROOT/build/check-steps"
if [ -z "$LIST" ]; then
  : >"$LOG"
  rm -rf "$STEPS"
  mkdir -p "$STEPS"
fi
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

# step_bg NAME CMD...: a step that runs beside the others (CHECK_SERIAL=1: an ordinary step). Its output goes to its own log, which
# join_steps appends to the check log, in the order the steps were started, once all of them have finished.
BG_PIDS=()
BG_NAMES=()
BG_LOGS=()
step_bg() {
  if [ -n "$SERIAL" ] || [ -n "$LIST" ]; then
    step "$@"
    return
  fi
  local name="$1" log
  shift
  log="$STEPS/$((${#BG_PIDS[@]} + 1)).log"
  printf '... %s (started at %ss)\n' "$name" "$((SECONDS - CHECK_START))" | tee -a "$LOG"
  (
    t0=$SECONDS
    "$@"
    rc=$?
    echo "$((SECONDS - t0))" >"$log.time"
    exit "$rc"
  ) 8>&- >"$log" 2>&1 &
  BG_PIDS+=($!)
  BG_NAMES+=("$name")
  BG_LOGS+=("$log")
}
kill_tree() {
  local c
  for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done
  kill -TERM "$1" 2>/dev/null
}
stop_bg() {
  local p
  for p in "${BG_PIDS[@]}"; do kill_tree "$p"; done
}
trap stop_bg EXIT
trap 'exit 130' INT TERM HUP
# join_steps: waits for every step_bg step, prints each one's output and time, and fails the check if any of them failed.
join_steps() {
  [ "${#BG_PIDS[@]}" -eq 0 ] && return 0
  local i rc failed=()
  for i in "${!BG_PIDS[@]}"; do
    wait "${BG_PIDS[$i]}"
    rc=$?
    {
      printf '\n==> %s\n' "${BG_NAMES[$i]}"
      cat "${BG_LOGS[$i]}"
      if [ "$rc" -ne 0 ]; then
        printf 'CHECK FAILED: %s (exit %s, %ss)\n' "${BG_NAMES[$i]}" "$rc" "$(cat "${BG_LOGS[$i]}.time" 2>/dev/null || echo '?')"
      else
        printf '<== %s: %ss\n' "${BG_NAMES[$i]}" "$(cat "${BG_LOGS[$i]}.time")"
      fi
    } | tee -a "$LOG"
    [ "$rc" -ne 0 ] && failed+=("${BG_NAMES[$i]}")
  done
  BG_PIDS=()
  BG_NAMES=()
  BG_LOGS=()
  if [ "${#failed[@]}" -gt 0 ]; then
    printf '\nCHECK FAILED: %s\n' "$(printf '%s; ' "${failed[@]}")" | tee -a "$LOG"
    exit 1
  fi
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

# The Go packages of this run: every one, or (changed mode) the plan's packages and the packages that import them. bdd/ is its own step.
go_packages() {
  if [ -z "$CHANGED" ] || [ "$PLAN_GO" = all ]; then
    go list -buildvcs=false ./... | grep -v '/bdd$'
    return
  fi
  local d
  for d in $PLAN_GO; do [ "$d" = bdd ] || echo "./$d"; done
}
run_go_vet() {
  local pkgs
  pkgs="$(go_packages)"
  { [ -z "$CHANGED" ] || [ "$PLAN_GO" = all ] || grep -qw bdd <<<"$PLAN_GO"; } && pkgs="$pkgs ./bdd"
  # shellcheck disable=SC2086
  go vet $pkgs
}
# Unit packages use the test cache: a package whose sources, test files, read files and environment have not changed is not run
# again ("(cached)"). The BDD suite (bdd/, the API driven in-process, scenario by scenario) always runs (-count=1).
run_go_test() {
  local pkgs
  pkgs="$(go_packages)"
  if [ -z "$pkgs" ]; then
    echo "no Go package besides bdd/ to test"
    return 0
  fi
  # shellcheck disable=SC2086
  go test $pkgs
}
run_bdd() {
  local tags="" a
  if [ -n "$CHANGED" ] && [ "$PLAN_BDD" != all ]; then
    # godog: "," is OR, "&&" is AND; every alternative keeps the @wip features parked.
    for a in $PLAN_BDD; do tags="${tags:+$tags,}~@wip && @area-$a"; done
    echo "BDD areas: $PLAN_BDD"
  fi
  if [ -n "$tags" ]; then
    GODOG_TAGS="$tags" go test -count=1 ./bdd/
  else
    go test -count=1 ./bdd/
  fi
}

# fast-checks (release preflight): a clean copy of the tree (the files git tracks, and the untracked ones it does not ignore, as they
# are on disk; nothing ignored: no web build, no build/, no local drop-in), at build/clean. The Go module must vet and build there
# with no web build (web/dist holds only what git tracks): a local web/dist once hid a deleted web/dist/.gitkeep (v1.0.0-beta.9).
# The shell tests then run from that copy, so a local file cannot make one pass (v1.0.0-beta.10), with the copy's web/node_modules a
# link to this checkout's and its web/dist this check's own build (shared by res-serving_test and precache_test: FEEDER_WEB_DIST).
CLEAN="$ROOT/build/clean"
make_clean_copy() {
  rm -rf "$CLEAN"
  mkdir -p "$CLEAN"
  git -C "$ROOT" ls-files -z --cached --others --exclude-standard \
    | (cd "$ROOT" && while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done) \
    | (cd "$ROOT" && tar --null -T - -cf -) | tar -xf - -C "$CLEAN" || return 1
  local dirty
  dirty="$(git -C "$ROOT" status --porcelain | wc -l)"
  echo "clean copy: $(find "$CLEAN" -type f | wc -l) files at build/clean${dirty:+ ($dirty changed or untracked file(s) of the working tree included)}"
}
run_preflight() {
  [ -d "$CLEAN" ] || { echo "no clean copy"; return 1; }
  echo "go vet ./... and go build ./... in build/clean, which has no web build (web/dist: $(ls -A "$CLEAN/web/dist" 2>/dev/null | tr '\n' ' '))"
  (cd "$CLEAN" && go vet ./... && go build -buildvcs=false -o /dev/null ./...)
}
# The copy's web side for the shell tests: the installed packages, and this check's web build (when it made one).
finish_clean_copy() {
  ln -sfn "$ROOT/web/node_modules" "$CLEAN/web/node_modules"
  if [ -f "$ROOT/web/dist/index.html" ] && plans build && wants web; then
    (cd "$ROOT/web/dist" && tar --exclude='./.*' -cf - .) | tar -xf - -C "$CLEAN/web/dist"
    export FEEDER_WEB_DIST="$CLEAN/web/dist"
  fi
}

# Every shell test of the profile runs (SHELL_TESTS), from the clean copy; the step fails if any of them fails. The tests that start
# Chrome (`# check-profile: browser`: servers on this checkout's port, the guard's lock) run one after the other in one lane; the
# others, CHECK_SHELL_JOBS at a time (default 4), beside that lane: each writes under its own mktemp dir. The output is printed per
# test, in file order.
run_one_shell_test() {
  local t="$1" log="$2" rc
  bash "$CLEAN/$t" 8>&- >"$log" 2>&1
  rc=$?
  echo "$rc" >"$log.rc"
  return "$rc"
}
run_shell_tests() {
  if [ "${#SHELL_TESTS[@]}" -eq 0 ]; then
    echo "no scripts/test/*_test.sh files"
    return 0
  fi
  local jobs="${CHECK_SHELL_JOBS:-4}" status=0 t i dir="$STEPS/shell" browser=() others=()
  rm -rf "$dir"
  mkdir -p "$dir"
  for i in "${!SHELL_TESTS[@]}"; do
    if grep -q '^# check-profile: browser' "$CLEAN/${SHELL_TESTS[$i]}"; then browser+=("$i"); else others+=("$i"); fi
  done
  (for i in "${browser[@]}"; do run_one_shell_test "${SHELL_TESTS[$i]}" "$dir/$i.log"; done) &
  local lane=$!
  for i in "${others[@]}"; do
    while [ "$(jobs -rp | wc -l)" -gt "$jobs" ]; do wait -n; done
    run_one_shell_test "${SHELL_TESTS[$i]}" "$dir/$i.log" &
  done
  wait
  for i in "${!SHELL_TESTS[@]}"; do
    t="${SHELL_TESTS[$i]}"
    printf -- '--> %s\n' "$t"
    cat "$dir/$i.log" 2>/dev/null
    if [ "$(cat "$dir/$i.log.rc" 2>/dev/null)" != 0 ]; then
      printf 'FAILED: %s\n' "$t"
      status=1
    fi
  done
  : "$lane"
  return "$status"
}

# UI guards first: they are instant. Each rule's mode lives in scripts/check-ui.rules.
if [ "$ONLY" = ui ]; then # used by scripts/test/check-ui_test.sh
  step "UI guards (scripts/check-ui.sh)" bash "$ROOT/scripts/check-ui.sh"
  [ -n "$LIST" ] && exit 0
  printf '\nCHECK PASSED (ui guards only)\n' | tee -a "$LOG"
  exit 0
fi
if wants ui && plans ui; then step_bg "UI guards (scripts/check-ui.sh)" bash "$ROOT/scripts/check-ui.sh"; fi

if wants install && plans install; then step "pnpm install (frozen lockfile)" pnpm -C web install --frozen-lockfile; fi
if wants web && plans typecheck; then step "typecheck" pnpm -C web typecheck; fi
if wants web && plans vitest; then step "vitest" run_vitest; fi
if wants web && plans build; then step "vite build" pnpm -C web build
  step "bundle budget" bash scripts/check-bundle-budget.sh
fi
join_steps
if [ -z "$LIST" ] && { { wants go && plans preflight; } || { wants shell && plans shell; }; }; then
  step "clean copy (build/clean)" make_clean_copy
fi
# Page-layout guard (R2-L): a route x viewport that is not inspected, or a refused run (a concurrent one), fails the run in every mode.
# Rule findings are WARN until a route is flipped in scripts/check-page-layout.modes. Missing Chrome or a missing frontend (the 503 'frontend not built' page) is a WARN here; a failed vite build already failed at the vite step above.
# PAGE_LAYOUT=skip skips it, PAGE_LAYOUT=full runs all six viewports and fails on any guard that did not run (default: quick profile).
# Full profile only: the ci profile leaves it out (it is the slowest step, and every release tag runs the full check locally first).
# The changed mode runs only the routes and scenarios the diff can affect (--changed-since).
LAYOUT_ARGS=()
[ -n "$CHANGED" ] && LAYOUT_ARGS=(--changed-since "$SINCE")
if wants layout && plans layout; then step_bg "page layout guard" bash "$ROOT/scripts/check-page-layout.sh" "${LAYOUT_ARGS[@]}"; fi
# int1: the shell guard (bottom bar, rails, wide screens; scripts/check-shell-layout.mjs) against a production build, on its own server.
if wants layout && plans shell-layout; then step_bg "shell layout guard" bash "$ROOT/scripts/check-shell-layout.sh"; fi
if wants go && plans go; then
  step_bg "go vet" run_go_vet
  step_bg "go test" run_go_test
fi
if wants go && plans preflight; then step_bg "release preflight (go vet and go build in build/clean, no web build)" run_preflight; fi
# Two phases: the browser guards beside the light Go steps, then the BDD suite beside the shell tests. All of it at once loaded a
# 24-CPU machine past what the guard's setups wait for (two scenarios not inspected in a measured run).
join_steps
if wants go && plans bdd; then step_bg "go test (BDD, bdd/)" run_bdd; fi

if wants shell && plans shell; then
  [ -z "$LIST" ] && finish_clean_copy
  if [ "$PROFILE" = ci ]; then
    step_bg "shell tests (scripts/test, no browser tests)" run_shell_tests
  else
    step_bg "shell tests (scripts/test)" run_shell_tests
  fi
  if [ -n "$LIST" ]; then
    for f in "${SHELL_TESTS[@]}"; do printf -- '    --> %s\n' "$f"; done
  fi
fi
join_steps

[ -n "$LIST" ] && exit 0
if [ "$PROFILE" = full ] && [ -z "$ONLY" ] && [ -z "$CHANGED" ]; then
  printf '\nCHECK PASSED (%ss)\n' "$((SECONDS - CHECK_START))" | tee -a "$LOG"
else
  printf '\nCHECK PASSED (CHECK_PROFILE=%s%s%s, %ss)\n' "$PROFILE" "${ONLY:+, CHECK_ONLY=$ONLY}" "${CHANGED:+, CHECK_SINCE=$SINCE}" "$((SECONDS - CHECK_START))" | tee -a "$LOG"
fi
