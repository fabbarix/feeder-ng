# R2-L: page layout (page widths, Page, StickyActionBar, rail contrast, info tone, layout guard)

Source: `docs/design/ui-review-2.md` (L-01, L-03, L-04, section 6 guards, R13's request for an info tone) and the R2-L row of its work-package table. Tests are written first and are red. Production code in this commit is type-only stubs: `app/pageWidths.ts` (empty table), `ui/Page.tsx`, `ui/StickyActionBar.tsx` (bare `<div>`), `scripts/lib/page-layout-rules.mjs` (empty rules), `scripts/check-page-layout.sh` (prints "not implemented", exits 0). No screen is migrated.

## Scope

In: page-width tokens, the route width table, `Page`, `StickyActionBar`, the shell wiring, L-04 (still open on main: `shell.css` has no accent-current rule), the info colour pair, the layout guard (`check-page-layout`, warn mode), the shell guard extension.
Deferred: `ui/Menu` (G-01) and L-12. They are in the R2-L row but not in this assignment; they touch `YourMenu.tsx` and share no code with the above. The PM should give them to the R2-L developer as a second commit or to a follow-up (`ui/index.ts` stays serialised).

## 1. Tokens (`styles.css`)

| Token | Value |
|---|---|
| `--page-narrow` | `720px` (content width) |
| `--page-default` | `1120px` |
| `--page-wide` | `1480px` |
| `--page-gutter` | `var(--gutter)` (16 phone / 24 from 768 / 32 from 1200, already there) |
| `--color-info-fg` / `--color-info-bg` | light `#1b4a7a` on `#d9e9fb` (7.4:1); dark `#a9d0f5` on `#14304c` (8.4:1) |

The widths are **content** widths. `Page` adds the two gutters (`--page-max: calc(var(--page-narrow) + 2 * var(--page-gutter))`), so a narrow form column is 720 px of content at every viewport and the gutter never eats it. The info pair is declared in all three scheme blocks (light, `[data-scheme=dark]`, and the pre-ThemeProvider `prefers-color-scheme` block); fg reaches 4.5:1 on its tint, on `--color-surface` and on `--color-bg`. Decision: **included**, because R13 asked for it and it is a pure `styles.css` addition that nobody else owns; adoption in `Tile`/`Chip` stays with R13. The name follows the caller's `--color-info*`; the existing family is `--status-*-fg|bg|solid`. **Decision (R2-L-b): keep `--color-info-fg|bg`.** They are a plain colour pair like `--color-accent`/`--color-soft`, not a status state (no `solid`, not tied to Tile/Chip tones), R13 already asked for these names, and a rename would touch three scheme blocks and the token test for no behaviour. Revisit only if R13 folds info into the `--status-*` tones.

## 2. One width per route: where it lives, who applies it

**Table**: `web/src/app/pageWidths.ts`, a sibling of `breadcrumbs.ts`. `ROUTE_WIDTHS: {path, width}[]`, `pageWidthFor(pathname)`, `explicitPageWidth(pathname)`. Plain TypeScript. Patterns: static segments, `:id`, trailing `/*`; specificity static > `:id` > wildcard. Query, hash and trailing slash are ignored. Unlisted routes answer `default`; a test walks every route the features register and requires an **explicit** entry, so a new route cannot inherit the fallback unnoticed.

Why not the breadcrumb table: only a third of the routes have crumbs, and width is not a hierarchy concern; one table per concern, same matching rules (the developer may extract `match`/`paramCount` from `breadcrumbs.ts` into a shared `routeMatch.ts`, tests for `crumbsFor` stay green).

**Applied by the shell, not by each screen.** `AppShell` computes `pageWidthFor(pathname)` and renders `<PageWidthProvider value={w}><Page width={w}>…<Outlet/></Page></PageWidthProvider>` inside `<main>`, inside the `PageErrorBoundary`. Reasons: (1) it fixes L-01 for **every** route the moment it merges, with no adoption package, so R2-1..R2-4 only delete ad-hoc `max-width` rules; (2) one decision, one place: the guard's P9 and the contract test compare the same table; (3) screens cannot disagree with it. A screen that needs the width reads `usePageWidth()` (container-sensitive code only). A screen that renders its own `<Page>` inside the shell is harmless: a `Page` inside a `Page` renders its header and body but **no** second `[data-page-width]` container, so there is never a nested cap. Chromeless routes (`/board`, `/cook/*`) get no `Page`: `<main class="app-main app-main--full">` as today (the table lists them as `full` so the guard has a contract for them).

`Page` API: `width?: 'narrow'|'default'|'wide'|'full'` (default: the context, else `default`), `header?: ReactNode`, `children`. Markup: `<div class="page" data-page-width><div class="page__header">…</div><div class="page__body">…</div></div>`; no header wrapper without a header. CSS (`Page.css`): `.page {inline-size:100%; max-inline-size:var(--page-max); margin-inline:auto; padding-inline:var(--page-gutter); box-sizing:border-box; min-inline-size:0}`, `--page-max` per width, `none` for `full`. Bottom clearance for the phone bottom bar stays on `.app-main` (`padding-bottom: var(--nav-clearance)`).

**`shell.css`**: `.app-main` keeps `min-width:0; width:100%; padding-bottom` and loses `max-width`, `margin: 0 auto` and `padding-inline`. Centring is then relative to the grid column right of the rail (88 px rail from 1024, 240 px from 1440), phone gutters are `Page`'s 16 px. `.app-main--full` is unchanged.

### Per-route width table

| Width | Routes |
|---|---|
| narrow (720) | `/scan`, `/recipes/import`, `/recipes/export`, `/ingredients`, `/ingredients/:id`, `/products`, `/products/:id`, `/settings`, `/settings/*` (household, members, meal-slots, planning, shops, shops/:id, notifications, allowlist, preferences, access-requests, recipe-assistant) |
| default (1120) | `/`, `/stock`, `/recipes/:id`, `/recipes/:id/edit`, `/recipes/new` |
| wide (1480) | `/plan`, `/recipes`, `/shop` |
| full (chromeless) | `/board`, `/cook/*` |
| fallback | anything else: default |

Same table as the review's guard draft. The editor stays `default` (E-01 lays it out in two columns); at 1440 the area right of the rail is 1200 px, so `wide` only differs from `default` from about 1720 px.

## 3. StickyActionBar (L-03)

`<StickyActionBar label? column?>{<FormActions …/>}</StickyActionBar>`: `<div class="sticky-action-bar" role="group" aria-label="Actions" data-column="page|narrow" data-stuck="false|true"><span sentinel aria-hidden/><div class="sticky-action-bar__inner">…</div></div>`.

- **Opaque**: `background: var(--color-surface)`, no alpha, no blur. Top hairline `1px solid var(--color-line)` always; `--elev-2` only while `data-stuck="true"` (content scrolls under it; `--elev-2` is `none` in dark, the hairline carries it).
- **Spans the Page container**: `margin-inline: calc(-1 * var(--page-gutter))` and the same padding, so its edges are the `[data-page-width]` edges (guard P6). It is a child of `.page__body` (or any descendant in the Page), never inside a card.
- **Aligned to the form column**: the inner row is centred (`margin-inline:auto`); `column="narrow"` caps it at `--page-narrow`, so an editor whose form is the narrow column has its actions under it, not at the far edge of a 1120 page. Default `page` uses the whole width. Actions are a `FormActions` row (right-aligned from 600, primary full width and on top on phones).
- **Position**: `position: sticky; bottom: var(--nav-clearance)` (the clearance is the floating bottom bar on phones and `0px` from 1024, so one rule covers L-03's phone/desktop split); `z-index` below the bottom bar's 10. From 1024 the inner bottom padding adds `env(safe-area-inset-bottom)`; on phones the clearance already includes it.
- **Stuck state**: a zero-height sentinel sits at the bar's natural position; an `IntersectionObserver` sets `data-stuck="true"` while the sentinel is not intersecting. Without `IntersectionObserver` the bar is simply never stuck.
- **Focus**: DOM order is form, then bar; no `tabindex`, no trap. A focused field must not hide behind the bar (WCAG 2.4.11): `:root { --sticky-bar-clearance: 96px }` and `html:has(.sticky-action-bar) { scroll-padding-block-end: var(--sticky-bar-clearance) }`.
- **Pages only.** Sheets and Dialogs already own a `FormActions` footer inside a scroll container; a sticky bar there would double it. Not tested, documented.

## 4. L-04 rail contrast

Still open on main. `shell.css`: (a) from 1440, after the soft current rule, `.side-rail__link[data-accent='true'][aria-current='page'] { background: var(--color-accent); color: var(--color-on-accent); box-shadow: 0 0 0 3px var(--color-soft) }`; (b) the compact 88 px rail has the same bug through the pill (white icon on the soft pill, 1.31:1): from 1024 `.side-rail__link[data-accent='true'][aria-current='page'] .side-rail__pill { background: none }`. Tests are CSS-level (`shell.css.test.ts`) plus the P7 rule in both guards; `styles.pageTokens.css.test.ts` proves on-accent/accent is already >= 4.5 in both schemes, so the fix is only the fill.

## 5. Layout guard

### Pieces
- `scripts/lib/page-layout-rules.mjs`: **pure** and unit-tested from vitest (`pageLayoutRules.test.ts`): `contrastRatio`, `evaluateMetrics(metrics, {width, route, kind})` -> `[{rule, message}]` for P1..P9, `ROUTES`, `PROFILES`, `modeFor`, `resolveRoute`. P1..P8 as in the draft with two fixes found while writing the tests: P6 fails when **either** edge is off the container (the draft used `&&`), and a new **P9**: the page container's `data-page-width` must equal the route table's kind (full routes excepted), which is the guard's check of the shell wiring.
- `scripts/check-page-layout.mjs`: the CDP driver (the draft, minus the inlined rules). `--url` required, `--profile quick|full`, `--ids build/page-layout-ids.json`. Replaces the fixed 1500 ms sleep with a settle poll (`readyState` complete, no `[aria-busy=true]`/`.skeleton` for 300 ms, 5 s cap), which is what makes the quick profile affordable. Prints one `  - <w>px <route>: <rule> …` line per finding, exits 1 on any.
- `scripts/test/fixtures/page-layout-seed.mjs`: the review seeder, committed (dev login, the data listed in "How this was reviewed"), writes `build/page-layout-ids.json` (`recipeId`, `ingredientId`, `productId`, `shopId`) that `resolveRoute` substitutes into `:id` routes. Idempotent on a fresh scratch dir.
- `scripts/check-page-layout.modes`: `default=warn` and `fail_routes=` (space separated patterns: exact, `:id`, trailing `/*`). **The per-route flip**: an adoption package adds its routes to `fail_routes` in its merge commit.
- `scripts/check-page-layout.sh`: the wrapper.

### Choice: wrapper wired into `check.sh`, not a separate release-QA script
Cost: a quick run is about 3 viewports x 25 routes x ~0.6 s (settle poll) plus a `go build` of a few seconds, measured at about 45 s, run once per `check.sh`. The full six-viewport run (about 3 min) is `PAGE_LAYOUT=full scripts/check.sh`, used by release QA. A guard that is not in `check.sh` is not run, and the per-route flip only means something if every worktree's check exercises it. Robustness comes from the wrapper: every failure of the environment (no Chrome, seeder crash, server not ready) is a printed `SKIP`/`WARN`, never a failed check; only a finding on a route listed in `fail_routes` fails. `PAGE_LAYOUT=skip` turns it off. It runs after `vite build` (the Go binary embeds `web/dist`) and before `go vet`.

### Wrapper contract (`scripts/check-page-layout.sh`)
1. `--print-port [--root DIR]`: `20000 + cksum(DIR) % 20000` (deterministic, per worktree); `--mode-of ROUTE`: `warn|fail` from the modes file.
2. `PAGE_LAYOUT=skip` prints "skipped", exit 0. `CHROME` (default `google-chrome`) not found: `SKIP: Chrome not found`, exit 0, nothing started.
3. `go build -buildvcs=false -o $BUILD/feeder ./cmd/feeder` unless `PAGE_LAYOUT_SERVER_CMD` overrides (tests).
4. Scratch: `$BUILD/page-layout-data` (recreated), log `$BUILD/page-layout-server.log`, `$BUILD` = `PAGE_LAYOUT_BUILD_DIR` or `<worktree>/build`.
5. `FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR=… FEEDER_ADDR=127.0.0.1:$PORT PORT=$PORT setsid nohup … &`, pid file, `trap … EXIT INT TERM` kills the process group. **Never leaves a server running**, on any path (seeder failure, guard crash, Ctrl-C).
6. Wait for `GET /` (30 s), run the seeder (`PAGE_LAYOUT_SEED_CMD`), run the guard (`PAGE_LAYOUT_GUARD_CMD`, default `node scripts/check-page-layout.mjs --url … --profile quick|full`).
7. Map each finding line's route to `modeFor`: any in a fail route: print them, `CHECK FAILED`-style message, exit 1; otherwise print `WARN: n page-layout findings (warn mode)` plus the lines, exit 0. Seeder or server trouble: `WARN`, exit 0.

### Shell guard (`scripts/check-shell-layout.mjs`)
Add 1920x1080 and 2560x1440; new rule 11: at >= 1024 on a non-chromeless route, the current rail item's label colour against its effective background is >= 4.5 (probe `railContrast`, same computation as P7; `/scan` is already in `ROUTES`, which is the route that exposed L-04). Rule 9 loses its `min(1100, …)` cap: `<main>` is now exactly its grid column. Tested at source level in `scripts/test/check-shell-layout_test.sh` (the script needs Chrome).

## 6. Tests (all new, all red against the stubs)

| File | Covers |
|---|---|
| `web/src/styles.pageTokens.css.test.ts` | page tokens, gutter ramp, info pair in 3 blocks and contrast, accent contrast |
| `web/src/app/pageWidths.test.ts` | the width table, matching, fallback, every feature route explicit, only chromeless is full |
| `web/src/ui/Page.test.tsx` | Page markup, width prop/context/default, nesting, `Page.css` |
| `web/src/ui/StickyActionBar.test.tsx` | markup, label, column, stuck state, focus order, CSS (opaque, sticky, safe area, hairline, elevation) |
| `web/src/app/AppShell.pageWidth.test.tsx` | shell wraps routes in the Page with the table width, chromeless exempt, `usePageWidth` |
| `web/src/app/shell.css.test.ts` (edited) | `.app-main` no longer caps width (two old 1100 px tests replaced); L-04 rules |
| `web/src/ui/Gallery.layout.test.tsx`, `ui/index.layout.test.ts` | Gallery sections Page and StickyActionBar (three widths), barrel exports |
| `web/src/app/pageLayoutRules.test.ts` | P1..P9, contrast, route contract with `pageWidthFor`, profiles, `modeFor`, `resolveRoute` |
| `scripts/test/check-page-layout_test.sh` | wrapper: port, modes, skip, no Chrome, env, args, warn vs fail, server always stopped, check.sh order, driver and seeder present |
| `scripts/test/check-shell-layout_test.sh` | 1920/2560 viewports, rail contrast rule, 1100 cap gone |

## 7. Implementation notes for the developer

- `index.ts` exports: `Page`, `PageWidthProvider`, `usePageWidth`, `PageProps`, `PageWidth`, `StickyActionBar`, `StickyActionBarProps` (already declared). `Gallery.tsx` gets `Page` (three framed demos, one per width) and `StickyActionBar` sections in both scheme blocks.
- `Page` nesting detection: a private context set by the outermost `Page`.
- Recipes `recipes.css` (`.recipe-detail, .recipe-editor { max-inline-size: 760px }`), `cook.css` (1100), `notifications.css` (640) are **not** touched here (adoption packages). Until then the editor stays 760 px inside a 1120 page; the guard reports it as warn.
- Gallery stays under `Gallery.css`; do not edit `ui/WeekdayPicker/` (R15) or the image fields (IM2).

## 8. Follow-ups (R2-L-b)

- **Guard time limits.** The wrapper's guard limit is `PAGE_LAYOUT_GUARD_TIMEOUT` (default 600 s; it was 900, then 300 while a run took ~45 s; since the filtered scenarios and walks a quick run takes ~200 s and a full one ~250 s, pantry-filter review), the seeder has `PAGE_LAYOUT_SEED_TIMEOUT` (90 s) and per-fetch timeouts (10 s). The driver bounds every CDP call, the `ws.onopen` handshake and the Chrome start (`PAGE_LAYOUT_CDP_TIMEOUT_MS` 20 s, `PAGE_LAYOUT_CHROME_TIMEOUT_MS` 15 s) and answers exit 2 (environment, a WARN) rather than hanging or crashing with exit 1. A timeout is a WARN, never a finding.
- **Chrome profile.** It lives in `<build>/page-layout-chrome-XXXX` (next to the ids file), Chrome runs in its own process group and the driver waits for it to exit before removing the profile; stale profiles of crashed runs are swept on the next start. Nothing is written to `/tmp` any more.
- **Compact rail (1024-1439).** The current Scan item gets the same 3 px soft ring as the expanded rail.

### ui/Menu (G-01) and L-12: not done here, sized

**G-01 is not small.** It is a new primitive plus two migrations in features other teams touch, so it is a work package of its own (about 1 day: tests first, then the primitive, then the call sites).
- `ui/Menu`: `<Menu trigger={IconButton} items=[{label, icon?, tone?, onSelect}]>`. From 768 px a popover anchored to the trigger (`position: fixed` from `getBoundingClientRect`, flips above when it does not fit, `role="menu"`/`menuitem`, focus to the first item, Arrow/Home/End, Escape and Tab close and return focus, outside click closes, same scrim-less rules as `YourMenu`); below 768 px it renders the existing `BottomSheet` with the same items. One `useMediaQuery('(min-width: 768px)')` decides.
- `YourMenu` already has the keyboard logic: extract it into `ui/Menu/useMenuKeys` (or make `YourMenu` a `Menu` client) rather than copying it.
- Call sites: `RecipeDetailScreen` (More: Archive, Delete) and `RecipesScreen` / `RecipesOverflowSheet` (Import, Copy Agent Prompt, Show archived). Both are under `features/recipes`, so the package must be serialised with any recipes team (E-01 editor, R13) and with `ui/index.ts`.
- Tests: Menu unit tests (open/close, keys, focus return, flip, both breakpoints), call-site tests (a popover on desktop, a sheet on phone), a guard probe that the popover stays inside the viewport at 768 and 1024.

**L-12 is decided: no action.** The review calls the avatar at the viewport edge an "acceptable app-shell convention". Moving the brand into the rail's first row changes the top bar grid at three breakpoints and every shell guard (rule 9 and 11); it should only be done if a user complains. Reopen then.
