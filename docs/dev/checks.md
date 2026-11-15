# Checks: changed, full and release

`scripts/check.sh` is the one check (also `make check`). It writes `build/check.log`, one log per side-by-side step under
`build/check-steps/`, and exits non-zero on any failure. Heavy runs on the shared machine go through the queue:
`build/ui-review-3/heavy <label> -- scripts/check.sh` (the brief's rule, unchanged).

## Which one to run

| You want | Run | Takes (24 CPUs, idle) |
| --- | --- | --- |
| to check your change while you work | `CHECK_SINCE=main scripts/check.sh` (any git ref) | 1 to 5 minutes |
| the full check (before you hand back a batch) | `scripts/check.sh` | about 8 minutes |
| a release (before a tag) | the full check on a clean, committed tree | the same |
| what the workflows run | `CHECK_PROFILE=ci CHECK_ONLY=web` or `CHECK_ONLY=go` | |
| to see what a run would do | add `CHECK_LIST=1` (with `CHECK_SINCE`, it prints the plan and why) | instant |

## The changed mode (`CHECK_SINCE=<ref>`)

`scripts/lib/check-plan.mjs` lists the files changed since the merge base of `<ref>` and `HEAD` (committed, staged, unstaged and
untracked) and plans the run. It prints every decision ("`page-layout: web/src/features/stock/stock.css is imported by / /pantry`").
It narrows a profile and never widens one: `CHECK_PROFILE=ci CHECK_SINCE=main` leaves the browser work out as well.

| A change to | runs |
| --- | --- |
| a `web/src` file | UI guards, typecheck, `vitest related` on it (plus the tests that read it from disk: they name it, or walk every stylesheet), the vite build, the page-layout routes whose screens import it (the import graph of `web/src`) and their scenarios |
| `web/src/ui/`, `app/`, `theme/`, `sw/`, the stylesheet, `main.tsx`, `index.html`, `public/` | as above, with every route and the shell layout guard |
| web configuration (`package.json`, the lockfile, `vite.config.ts`, `tsconfig*`, `src/test/`) | every web check |
| a Go file | `go vet` and `go test` of its package and every package that imports it (`go list`), the BDD features tagged with its area, and the routes of its area (`scripts/lib/check-areas.mjs`); a package that is not in that map (app, db, household, …) selects every feature and every route |
| a `_test.go` file | its package only |
| `go.mod`, `go.sum` | every Go package and every BDD feature |
| a `.feature` file | the features of its `@area-` tag; a step file: every feature |
| the page-layout guard or its seed | every route; a scenario module: its own scenarios |
| a shell test | itself; any other file: the shell tests that name it, or list it in a `# check-paths:` line |
| `scripts/check.sh` or the planner | the whole check |

The release preflight runs whenever any Go runs. Measured (one change each, idle machine):

| Change | Ran | Time |
| --- | --- | --- |
| a comment in the Pantry stylesheet (`web/src/features/stock/stock.css`) | 85 vitest files, the guard on `/`, `/pantry`, `/settings/access-requests` and 26 scenarios (99 probes) | 61 s |
| a comment in `internal/shopping/httpapi/httpapi.go` | go vet and go test of 27 packages, BDD `@area-shopping-scan @area-scan`, the guard on `/shop` and 15 scenarios (50 probes), the preflight | 75 s |
| a comment in `web/src/ui/BentoGrid.tsx` (a shared primitive) | 826 vitest files, every route (649 probes), the shell layout guard | 259 s |

## The full profile

The web steps run in order (the UI guards beside them). Then two phases run their steps side by side, each into its own log under
`build/check-steps/`: the page layout guard and the shell layout guard with `go vet`, `go test` and the release preflight; then
the BDD suite with the shell tests. A phase fails once all its steps have finished if any failed. (All of it at once overloaded
the machine: two guard scenarios waited past their limits.) `CHECK_SERIAL=1` runs every step one after the other, to read a
step's output as it comes.

- **vitest**: two projects over the same files (2,013 before fast-checks, 22,088 tests; 2,014 and 22,096 with its own test):
  `logic` (the `lib/` tests and the CSS-contract tests, ~590 files) runs in threads without per-file isolation, and resets fake
  timers and mocks when a file ends (`src/test/logic-isolation.ts`); `dom` (the rest) is isolated as before, in threads.
- **Page layout guard**: seeded once, then split in units run by parallel workers, each unit on a fresh copy of the seeded
  database, at a fixed time of the week (`scripts/lib/page-layout/README.md`). 648 probes quick, 765 full: the serial run's 649
  and 766 less shop-complete-restore, a scenario that only undid shop-complete on the shared server.
- **Go**: unit packages use the test cache; the BDD suite always runs, scenarios concurrently, the `@serial` features (they swap
  process-wide state) one by one after (`GODOG_CONCURRENCY=1`: everything one by one).
- **Release preflight**: `build/clean` holds the files git tracks and the untracked ones it does not ignore, as on disk, and nothing
  else (no web build, no `build/`, no ignored drop-in). `go vet ./...` and `go build ./...` must pass there with `web/dist` holding
  only `.gitkeep`, and the shell tests run from there, so a local file cannot make a check pass that a clean checkout fails.
- **One web build**: the check's own build is shared with `res-serving_test.sh` and `precache_test.sh` (`FEEDER_WEB_DIST`).

Before and after (24-CPU machine):

| Step | Before | After |
| --- | --- | --- |
| full check | 35 to 40+ min | 491 s (8.2 min), warm Go test cache |
| page layout guard (quick, 649 probes) | 1000-1560 s | 184 s (12 workers) |
| vitest (2,013 files) | 4-7 min | 96 s |
| BDD (1,381 scenarios) | 220-280 s | 99 s |
| fixture shell tests (actions, chips) | 424 s each | 13 s each |
| shell tests (38) | not measured | 193 s, from the clean copy |

## A release check

Commit everything, then run the full check (`scripts/check.sh`, no `CHECK_SINCE`). Its release preflight and the shell tests
already run on the clean copy; with nothing uncommitted, that copy is exactly `git archive HEAD`. The workflows' Go job
(`CHECK_ONLY=go`) runs the preflight too.

## Knobs

`PAGE_LAYOUT_WORKERS` (default: half the CPUs, at most 12; `0`: one driver as before), `PAGE_LAYOUT_NOW` (another seed instant),
`GODOG_CONCURRENCY`, `GODOG_TAGS`, `CHECK_SHELL_JOBS` (default 4, beside the browser lane), `CHECK_SERIAL=1`.
