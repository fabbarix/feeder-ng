# b5-pl: page-layout guard coverage ("not inspected" fails)

## Problem

The full check printed `check-page-layout: could not inspect <w>px <route> (... Cannot read properties of null (reading 'getBoundingClientRect'))`
for most of the route table and still ended `check-page-layout: OK`. Phone layout (390px) is the guard's main job, so coverage must not drop silently.

## Findings (log of the ci-runner worktree, `build/check.log` and `page-layout-*`)

It was not ~20 routes, it was 86 of 93 route x viewport probes (3 viewports x 31 routes):

| viewport | not inspected |
| --- | --- |
| 390px | 24: `/recipes/1` (dark pass), then every route from `/recipes/1/edit` to `/board` |
| 1440px | all 31 |
| 1920px | all 31 |

Only the first 7 routes at 390px (`/` to `/recipes`) were probed. There is no per-route cause (no seed gap, no 390px-only element, no redirect):
the routes only look like `/recipes/*`, `/ingredients/*`, `/products/*`, `/settings/*` because they come after the point where the server went away.

Root cause, in two parts:

1. **The server was stopped under the guard.** `check.log` holds two interleaved `scripts/check.sh` runs in the same worktree.
   The first run started its server at 18:42:33 (`feeder listening`), the second run's wrapper found the port taken
   (`WARN: something already listens on ... page layout guard not run`) and exited, and at 18:42:45 the server logged `shutting down`.
   Why: `scripts/check-page-layout.sh` installs `trap stop_server EXIT` before the "port is taken" check, and `stop_server` falls back to
   `$BUILD/page-layout-server.pid`, which is the first run's pid. So the second run's exit killed the first run's server. (The two runs also
   share `build/` and the driver sweeps `build/page-layout-chrome-*`, so they could remove each other's Chrome profile too.)
   From then on every navigation gets Chrome's connection-error page.
2. **The probe cannot tell "the app is not there" from a layout.** Chrome's error page (or a `503 frontend not built` text page) has no `<main>`;
   the probe's last statement is `(pageEl || main).getBoundingClientRect()` and `main` is `null`, hence the `TypeError`. The driver catches it,
   prints `could not inspect` to stderr, goes on, and `check-page-layout: OK` is printed because `failures` only holds rule findings.
   The wrapper does not look at stderr lines at all, so the check passes.

Reproduced in `team/b5-pl` with a stub server that answers `/api/dev/login` and `503` for everything else: three `could not inspect ... getBoundingClientRect`
lines for `/settings` and `check-page-layout: OK`. A second wrapper run on the same port stops the first run's server (test below).

Same blind spot seen once more by hand: a worktree whose `web/dist` is empty/mis-copied embeds no frontend, the server answers 503 on every page, and the guard
reports `OK` with 93 of 93 routes not inspected. A real, healthy run (web/dist copied from the ci-runner build, quick profile) inspects all 93 and reports no finding
on any route (including every `/recipes/*`, `/ingredients/*`, `/products/*`, `/settings/*` at 390px), so there is no layout defect hidden behind this. The routes
were never really unprobeable.

## Fix

Harness (`scripts/check-page-layout.mjs`, new `scripts/lib/page-layout-coverage.mjs`):

- The probe step first checks that the page rendered the app: `document.querySelector('main')`. If not, the route x viewport is **not inspected** with the
  reason `no <main> element (<page title or first 80 chars of body text>)`. The raw `TypeError` never reaches the output. Any other probe error (CDP timeout,
  navigation failure) is also "not inspected" with its message; so is a dark-scheme pass that did not apply (`dark scheme: ...`), listed as `<w>px <route> (dark)`.
- Not-inspected entries are collected (not only printed to stderr) and printed on stdout as `  ! <w>px <route>: not inspected (<reason>)`.
- The driver ends with `check-page-layout: coverage: inspected N of M (not inspected K: E exempt, F failing)`, M = viewports x routes (after `PAGE_LAYOUT_ONLY`).
  It exits 1 when there is any rule finding **or** any failing not-inspected entry, and never prints `OK` then. The `OK` line stays when F = 0.
- Pure functions in `scripts/lib/page-layout-coverage.mjs`: `parseExemptions(text, routes)`, `coverageSummary({inspected, notInspected, exemptions})`,
  `notInspectedLine(entry)`; unit-tested.

Wrapper (`scripts/check-page-layout.sh`):

- A `! ... not inspected` line fails the run (exit 1, message `page layout guard FAILED: K route(s) not inspected`) in **any** mode: the modes file
  (warn/fail) applies to rule findings only, never to coverage. This applies to the quick profile too, because `check.sh` runs quick and that is where it was lost.
- `stop_server` only stops a server **this run started**: the pidfile fallback is removed (a `STARTED` flag set after the spawn), and the "port is taken" check
  happens before the trap that stops servers. A second run on the same port therefore leaves the first run's server alone.
- A **refused run** fails in every mode, quick included (PM decision): a busy port, or the worktree's lock held by another run, means a concurrent run, which is
  exactly the lost-coverage case. The refused run exits 1 with `page layout guard FAILED: ...` and does not touch the other run's lock, server or `build/`.
  The busy-port message names the port and the pidfile (`$BUILD/page-layout-server.pid`), so a foreign server is easy to find.
- **The lock** is `flock -n` on `$BUILD/page-layout.lock`, held on a file descriptor for the script's whole life. The kernel drops it when the process dies,
  so there is no stale-lock handling and a leftover lock file is harmless. A lock held by a live process refuses the run and is left alone. (The wrapper
  sweeps old `build/page-layout-chrome-*` profile dirs; that is safe only because it runs under this lock. Say so in a comment at the sweep.)
- **Crash is not a pass.** A guard that exits 1 without printing a `check-page-layout: coverage:` line crashed: the run FAILS in every mode. An unreadable modes
  file (the `count-fail` helper fails) FAILS too; the old `|| echo 0` fallback must not turn an unknown fail count into a pass. The driver's exit 2 (usage error,
  invalid or missing exemption file, could not start the session) FAILS in every mode.
- **Quick versus full** (PM decision). Lost coverage fails in quick as well: the server did not start, a seed failure or seed timeout, a guard timeout, and the
  driver's "could not start the session" all FAIL. Only two environment gaps stay SKIP/WARN (exit 0) in quick, and both FAIL in full (`PAGE_LAYOUT=full`):
  no Chrome, and no web build. "No web build" means the server answers the 503 `frontend not built` page on `/` (or `web/dist` has no `index.html`); the wrapper
  detects it right after the server is up, stops the server, runs neither seeder nor guard, and WARNs (quick) or FAILs (full).
- The OK line prints the probe count from the coverage summary: `page layout guard: OK (quick profile, 93 probes, 45s)`.

## The rule: zero tolerance, explicit exemptions

- Every route x viewport must be inspected. "Not inspected" fails the guard.
- A route that legitimately cannot be probed (none today) must be listed in `scripts/check-page-layout.exempt`, one line `<route pattern> <reason>`
  (`#` comments allowed). The pattern must be a `ROUTES` pattern, the reason non-empty; otherwise the driver exits 2 with the parse error.
  An exempt route is still attempted; if it cannot be probed it is reported `exempt` (counted in the summary) and does not fail. If it **is** inspected,
  it is a normal route (so an exemption cannot hide a finding).
- A dead server, a build without a frontend and a probe crash are never valid reasons; a test asserts the shipped list does not mention them.
- The shipped list is empty. Tests parse it (every entry valid, has a reason), so adding an exemption is a visible, reviewed change.

## Tests (written first, `scripts/test/check-page-layout-coverage_test.sh`, red)

- Coverage module: `parseExemptions` (shape, missing reason, unknown pattern), `coverageSummary` (failing vs exempt, totals, summary line), `notInspectedLine`.
- Shipped exemption list exists, parses, no illegitimate reasons.
- Driver against a stub server without a rendered app (needs Chrome; skipped without): exit 1, `! 390px /settings: not inspected`, reason `no <main>`,
  no raw `getBoundingClientRect`, summary `inspected 0 of 3`, no `OK`; with an exemption file the same run passes as `3 exempt, 0 failing`; a dead server never ends in `OK`.
- Wrapper with fakes: a `not inspected` line fails in warn mode; a fully inspected run passes and shows the coverage line and the OK probe count; full mode fails
  when the seeder fails; a second run on the same port does not stop the first run's server and fails itself in full and in quick.
- Lock: a `flock` held by a live process refuses a quick and a full run (FAILED) and is left alone; after the holder dies, a run proceeds (a leftover lock file
  is not a lock). A foreign server on the port with a free lock (separate build dir) fails in quick, names the port and the pidfile, and keeps running.
- Crash: a guard that exits 1 without a coverage line fails in quick and full; an unreadable modes file fails; the driver's exit 2 (bad or missing exempt file,
  missing `--url`) fails the wrapper in quick and full, and the driver itself exits 2 for each.
- Quick FAILs: server not started, seed failure, seed timeout, guard timeout, driver exit 2. Quick SKIP/WARN: no Chrome (FAILED in full), 503 `frontend not built`
  (WARN in quick, FAILED in full, seeder and guard not run, server stopped).

`check-page-layout_test.sh`: the old WARN-exit-0 assertions for a hanging guard and a hanging seeder now expect a FAILED run in quick.

## Files

`scripts/check-page-layout.mjs`, `scripts/check-page-layout.sh`, `scripts/lib/page-layout-coverage.mjs` (new), `scripts/check-page-layout.exempt` (new, empty),
`scripts/test/check-page-layout-coverage_test.sh` (new), `scripts/test/check-page-layout_test.sh`, `scripts/check.sh` (step title: the guard is no longer warn-only).
No CHANGELOG entry: the change is to developer tooling, not user-facing.
