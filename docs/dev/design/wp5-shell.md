# WP5: shell (navigation, chromeless, not-found, error boundary, avatar menu, boot paint)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 4.5, 5.17 and section 7 WP5, plus QA B2 (shell part), B3, B12. Scope: `web/src/app/**`, `web/index.html`,
`scripts/check-ui.rules`, one new script. Nothing in `web/src/ui` or in feature folders except the one-entry icon addition below.

## File layout
| File | State | Notes |
|---|---|---|
| `app/AppShell.tsx` | Developer rewrites | bars, status slot, menu, chromeless frame; imports `Icon` from `'../ui'` (the tests mock that module) and `./shell.css` |
| `app/shell.css` | new (red) | all shell rules, moved out of `styles.css` (which loses `.app-shell`, `.top-bar`, `.app-main`, `.bottom-bar`, `.side-rail`, `.your-menu*`, `--bar-height`) |
| `app/nav.ts` | done | `PrimaryNavItem.icon: IconName`, `accent` replaces `raised`; `NavItem.icon?`; Kitchen board added to `MENU_NAV` |
| `app/strings.ts` | Developer extends | menu labels stay in `nav.ts`; add not-found / error copy (below) |
| `app/NotFound.tsx` | stub | `EmptyState` + `Button`; used by the `*` route |
| `app/PageErrorBoundary.tsx` | stub | class boundary around the shell `Outlet` (`resetKey` = pathname) and `RouteErrorBoundary` (router `errorElement`) sharing one `ErrorPage` fallback |
| `app/ShellStatus.tsx` | stub | the only importer of WP4's `ui/OfflineBanner` |
| `app/useConnectivity.ts` | stub | `{ offline, savedAt }` from `navigator.onLine` and window `online`/`offline` events |
| `app/features.ts` | Developer | `buildRoutes` appends `{ path: '*', element: <NotFound /> }` |
| `main.tsx` | Developer | root route gets `errorElement: <RouteErrorBoundary />` |
| `app/providers.tsx` | Developer | `DEFAULT_ACCENT` hex is a `colour-literals` violation and is unused: delete it |
| `ui/icons.ts` (+ test, `wp2-icons.md`) | done | one entry, `board: Monitor` (Kitchen board). Shared with WP4's `minus`; keep the diff to this one line each |
| `web/index.html` | Developer | boot paint |
| `scripts/check-shell-layout.mjs` | done | scripted browser check, below |

## Decisions
- **Breakpoints.** Bottom bar below 1024, rail from 1024 (spec), expanded 240 rail from 1440. The old 900 breakpoint is gone; that is what pushed `/board` into a 220 px column (B3).
  Bar max width 480, centred, so it is a pill on a portrait tablet (820).
- **Chromeless (B3).** `.app-shell--chromeless { display: block; padding: 0; min-height: 100dvh }` and `.app-main--full { max-width: none; margin: 0; padding-bottom: 0 }`.
  The grid rules apply to `.app-shell:not(.app-shell--chromeless)` so no media query can re-apply them. The tests assert both the classes in the DOM and the CSS.
- **Clearance.** `:root { --nav-height: 70px; --nav-inset: 12px; --nav-clearance: calc(var(--nav-height) + var(--nav-inset) + var(--space-4) + env(safe-area-inset-bottom, 0px)) }`
  (98 px + safe area). `.app-main { padding-bottom: var(--nav-clearance) }`; from 1024 `--nav-clearance: 0`. Toast (WP4) and sticky action bars should use `var(--nav-clearance)`
  instead of `98px`; `index.html` already has `viewport-fit=cover`.
- **Active tab.** `NavLink` supplies `aria-current="page"`; CSS styles `[aria-current='page']` (no extra class). The icon weight comes from `NavLink`'s `isActive` render prop:
  `fill` when active, `regular` otherwise. Scan is the `data-accent` button (58 px bar, 56 px rail), in the bar and not raised; on `/scan` it gets a 3 px `--color-soft` ring.
- **Rail order.** Scan first (spec: "at the top"), then Today, Plan, Shop, Recipes. The bar keeps Today, Plan, Scan, Shop, Recipes.
- **Avatar menu (5.17).** Rows: Stock, Kitchen board, | divider |, Settings, feature items (by `order`, default icon `chevron`), Sign out (last, `data-tone="danger"`, danger-tertiary text).
  Each row has a 20 px `Icon`. Focus goes to the first item on open; Arrow Up/Down wrap, Home/End jump, Escape closes and returns focus to the avatar button.
  A transparent `data-testid="menu-scrim"` button-less layer (`.your-menu-scrim`, `--scrim`) closes on click. The trigger is a 40 px, radius 14 square avatar.
  The brand word is hidden below 1024.
- **B2 (shell part): Kitchen board.** `/board` is linked from the avatar menu (a wall-display destination, not a daily tab, so it does not earn a bar slot).
  **Not in scope here:** the Cook Mode entry points on Planned Meals (Today/Plan) and on Recipe detail belong to the WP6/WP7/WP8 screen teams.
- **Not found (B12).** `*` route inside the shell: `EmptyState` (icon `info`), title "Page not found", text "That page does not exist or has moved.", `Button` "Go to Today". Under `/board/x`
  it is chromeless like its parent. Strings: add `notFoundTitle`, `notFoundText`, `goToToday`.
- **Errors (B12).** `PageErrorBoundary` wraps the shell `Outlet` so the bars survive a broken page and navigating away resets it. `RouteErrorBoundary` (root `errorElement`) covers loader and
  router errors; it shows Page not found for a 404 response, otherwise the same error state. Fallback: `EmptyState` (icon `error`), "Something went wrong",
  "Feeder could not show this page. Your data is safe.", `Button`s "Reload page" and "Go to Today" (secondary). Never the message or stack. `ErrorState` (WP4) is an inline tile, so a page-level fallback uses `EmptyState`.
- **OfflineBanner slot.** WP4 API (read-only, `wp4-primitives-b.md`): `<OfflineBanner offline savedAt pendingScans />`, `role=status`, null when online. `ShellStatus` maps
  `useConnectivity()` + the `pendingScans` prop onto it; `AppShell` renders it once between the top bar and `<main>` (not on chromeless routes). `pendingScans` is a prop on `AppShell`
  (default 0): the queue lives in the scan feature (`useSyncQueue`), and the shell must not import features. The scan team or `AppRoot` wiring can feed it later; no value shows no pending line.
  `ShellStatus.tsx` imports `../ui/OfflineBanner` directly (not the barrel) so the import is a single line to adjust. **The Developer must sync with `team/wp4-primitives-b` first**, or typecheck
  and `ShellStatus.test` cannot resolve it. The other shell tests mock `./ShellStatus` and do not need WP4.
- **Boot paint (`index.html`).** `<meta name="color-scheme" content="light dark">`; one inline `<style>` painting `html` with the light `--color-bg` and, under `prefers-color-scheme: dark`
  and `html[data-scheme='dark']`, the dark one (values equal the tokens; the test reads `styles.css`); two `theme-color` metas with `media` light/dark equal to the same backgrounds. No colour, font or layout
  beyond the background. Keep `viewport-fit=cover`.
- **Guards.** `check-ui.rules`: `native-ui`, `colour-literals`, `class-hooks`, `sizing` now also `fail_paths=web/src/ui web/src/app`. Today `check-ui` fails on `app-shell--chromeless` (no rule) and the
  `providers.tsx` hex: the red state until the Developer finishes. `phosphor` is already `fail`; `native-search` has no sites in `app`.

## Review round 2 (Designer additions)
- **`useShellStatus` extension point.** `FeatureModule.useShellStatus?: () => { pendingScans?: number }` (exported types `ShellStatusInfo`, `ShellStatusHook`). `collectFeatures` returns
  `statusHooks` (module key order, only features that export one). `AppRoot` takes a `statusHooks` prop (main.tsx passes `collectFeatures(modules).statusHooks`), calls each hook every render and
  sums `pendingScans` into `AppShell`. The list is fixed for the app's life (eager glob), so calling hooks in a loop keeps hook order stable; AppRoot must say so in a comment.
  The scan team later exports `useShellStatus` (from `useSyncQueue`) in `features/scan/index.ts`; no shell edit needed then.
- **Boot paint mark.** `#root` contains a centred Feeder mark (inline SVG or text with the word Feeder; `#root` is a min-height 100vh centring grid in the inline style) that React replaces on mount.
- **Layout fixes tested.** Avatar anchored right (`margin-left:auto` on `.your-menu-anchor`); rail/main grid rows do not stretch at >= 1024 (`align-content:start`); Tab closes the avatar menu;
  rail icons sit in a `span.side-rail__pill` (56 x 32 at 88 px, soft when `aria-current`); trigger 40 px square radius 14; Toast's bottom is `var(--nav-clearance)` plus a gap (no 98 px).
- **Browser check** also asserts: menu popover inside the viewport, avatar on the right half below 1024, rail and `<main>` within 120 px of the top at >= 1024.

## Tests (all red until implemented unless noted)
`AppShell.test` (bar and rail structure and order, icon name/size/weight, aria-current moving on navigation, Scan accent not raised, status slot position and `pendingScans`, avatar menu entries, icons,
divider, danger Sign out, focus on open, arrow keys, Escape focus return, scrim); `AppShell.chromeless.test` (no bars, full-viewport classes, ordinary routes keep the bars);
`NotFound.test`; `PageErrorBoundary.test`; `useConnectivity.test`; `ShellStatus.test` (needs WP4); `shell.css.test` (every number of 4.5/5.17, no 900 breakpoint, chromeless rules, no literals, rules moved
out of `styles.css`); `bootPaint.test` (reads `index.html`). `features.test` is unchanged and must stay green with the extra `*` route.
`icons.test` has the one-line `board` addition.

## Scripted browser check
`scripts/check-shell-layout.mjs --url http://localhost:<port>` (Chrome over raw DevTools protocol, no dependency; start `pnpm -C web dev --port <p>` detached first, kill it after). It fakes `/api/me`,
loops 390/820/1280 px by 10 routes (all primary and menu destinations, `/board`, `/cook/1`, an unknown route) and checks: no sideways scroll (`scrollWidth <= clientWidth`, which equals `innerWidth`
when the scrollbar is overlaid), the end of the page clears the bottom bar (a 2500 px probe is appended to `<main>` and scrolled to the end), `/board` and `/cook/*` have no nav and a full-width `<main>`,
`aria-current` on the right tab, bar below 1024 and rail from 1024 exclusively, "Page not found" for the unknown route and no router dev error page. Run on `main` it reports the known bugs
(220 px board, dev error page); it must print `OK` after the Developer's work. It is not part of `scripts/check.sh` (needs Chrome).
Manual extras for the Reviewer: in dark mode and with `prefers-reduced-motion`, open the avatar menu, check the scrim and focus ring; at 390 px with a phone's home-indicator safe area (DevTools device
emulation) the bar sits 12 px plus the inset above the bottom edge; reload with the OS in dark mode and watch for a white flash.
