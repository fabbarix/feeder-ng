# QA follow-ups (1.0.0-beta.4.1, team FU)

Four follow-ups the reviewers found after `qa-sticky.md` and `qa-hero-board.md`. Tokens, from `web/src/app/shell.css`:
`--nav-clearance` (content padding above the floating bottom bar, 0 from 1024) and `--nav-top` (the bar's top edge, no gap, 0 from 1024).

## FU-1 Toast above the sticky action bar

On phones the toast region (`bottom: nav-clearance + space-3`) overlaps the sticky bar (Save, Start Cook Mode), which sits at `bottom: --nav-top`.

- `Toast.css`: `.toast-region { bottom: calc(var(--nav-top) + var(--space-3)) }` (above the bottom nav, or the viewport edge from 1024).
- `Toast.css`: `html:has(.sticky-action-bar) .toast-region { bottom: calc(var(--nav-top) + var(--sticky-bar-clearance) + var(--space-3)) }`.
  `--sticky-bar-clearance` already exists in `StickyActionBar.css`; its derived default is 121 px (2 x padding 12 + 1 border + 2 x 44 control + 8 gap, the two-row bar of the recipe editor on a phone).
  `useStickyBarClearance` publishes the measured bar height on the document root (largest of the mounted bars; removed when the last unmounts), so the default only applies before the first measurement or without ResizeObserver.
  The scroll padding is `calc(var(--nav-top) + var(--sticky-bar-clearance))`: on phones the bar sits `--nav-top` above the bottom. Toast z-index (30) stays above the bar (5).
- Shell guard rule 14 (`scripts/check-shell-layout.mjs`, phone 360 and 390 px, `/recipes/new`): raise a toast, then assert the toast region's bottom edge is at or above
  the sticky bar's top edge (1 px tolerance). Source-level check in `scripts/test/check-shell-layout_test.sh`.

## FU-2 No bar padding on full-screen pages

The rule lives in `StickyActionBar.css` (not `shell.css`): `.app-main:has(.sticky-action-bar):not(.app-main--full) { padding-bottom: var(--nav-top) }`.
`app-main--full` is the class `AppShell` sets on chromeless pages (`app-main app-main--full`); its padding stays 0.

## FU-3 Stale `--nav-clearance` wording

`--nav-clearance` is still real and used (`.app-main` bottom padding), so it stays. Fixed: the `Toast.css` and `StickyActionBar.css` header comments and the
`overlays-css.test.ts` / `StickyActionBar.test.tsx` titles now say `--nav-top`; the `shell.css.test.ts` header no longer says "one clearance variable".

## FU-4 P10 in both colour schemes

ThemeProvider reads the system scheme once at render and then writes `data-scheme` itself, so emulating dark on a loaded page changes nothing.
After the light probe the driver therefore calls `Emulation.setEmulatedMedia` (`prefers-color-scheme: dark`), reloads the page (`Page.reload`/`Page.navigate`),
runs `settle()`, and checks `document.documentElement.dataset.scheme === 'dark'`. If it is not dark the driver reports an environment problem
("could not inspect", no finding, never clean). Only then does it re-run the button probe into `lowContrastButtonsDark`, then resets the media to `light`.
Order and isolation: the light findings (`evaluateMetrics`, `fail`) are reported first. The dark pass then runs in its own try/catch/finally (the media reset to `light` is in the finally; a dark error is logged as "could not inspect <tag> (dark scheme: ...)", not a finding), `Page.reload` is raced with `sleep()` like the first navigation, and afterwards only the dark P10 findings are reported (metrics with an empty light list), never the light ones twice.
The dark pass runs on every viewport of the run. `evaluateMetrics` adds one P10 finding per entry; dark ones read `Button "X" contrast 1.3:1 (< 4.5, dark scheme)`. The light message is unchanged.
A missing `lowContrastButtonsDark` (older probe) is clean.

## Tests (red first)

- `web/src/ui/qaFollowups.css.test.ts` (FU-1, FU-2, FU-3), `web/src/ui/overlays-css.test.ts` (toast bottom).
- `web/src/app/pageLayoutRules.followups.test.ts` (FU-4 rule and driver source).
- `scripts/test/check-shell-layout_test.sh` (rule 14 documented and present).
