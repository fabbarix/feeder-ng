# UI remediation plan 3: building 1.0.0-beta.9

Status: plan, 2026-11-14. Executes [ui-review-3.md](ui-review-3.md) (135 items in ten chapters, 56 decisions, rules R-A to R-F, R-C+ and R-D+). Release: **1.0.0-beta.9**, tag `v1.0.0-beta.9`.

Paths: frontend paths are relative to `web/src/`, and Go paths are relative to the repo root. "Chapter" links point into `ui-review-3/`.

## 1. How the work runs

The pipeline follows [CLAUDE.md](../../CLAUDE.md), with the session memory rules (the main session manages, reviewers fix, checks are batched, developers run on Opus):

- **The main session manages.** It starts every agent, runs `ListAgents` before each status report, and starts the next agent as soon as one hands back. There is no Project Manager agent.
- **One package per team**, on branch `team/b9-<slug>` in worktree `/opt/mrwho/Projects/feeder-ng.worktrees/b9-<slug>`, cut from `main` when the package starts.
1. **Test author (Sonnet)** writes the unit tests and the BDD scenarios (`bdd/features/<area>/*.feature`) named in the chapter items, plus the page-layout scenario or rule module the package owns. All of them fail first.
2. **Developer (Opus, by the user's instruction of 2026-11-14)** implements until they pass. Domain logic goes in `lib/` and hooks, never in components. Go handlers stay thin. Every control is a shared primitive (no native UI), and every icon comes from Phosphor through `ui/icons`. The developer runs only targeted tests: one vitest file or folder, `go test ./internal/<pkg>/...`, `CHECK_ONLY=ui scripts/check.sh` (instant), and `node scripts/check-page-layout.mjs --scenario <own>` against its own detached server (`setsid nohup … > build/server.log`).
3. **Reviewer (Opus)** checks the diff against the chapter items, the mocks at their sizes in light and dark, GLOSSARY, ADRs, system.md and the R rules, using the visual checklist in section 6. It **fixes what it finds itself**, one commit per fix, and states any test it changed and why. It re-runs the targeted checks and approves. It hands back only a product or design decision for the user, or a change outside the package's files. Nothing merges without its approval.
- **Never** `git stash`. Each worktree writes `build/check.log` and nothing shared. No synthetic load. Servers start detached.
- **One batched check-runner** owns every full `scripts/check.sh` run (section 9). `main` moves only by `git merge --ff-only` to an integration batch that passed.
- **Start rule (waves are an order, not a barrier).** A package may start as soon as three things hold:
- every package in its "Depends on" is on `main`;
- no package in flight owns any of its files (section 4);
- fewer than **6** teams are running.

The waves below are the order in which that rule lets packages start. A wave closes when all its packages are on `main`.
- **Questions.** A team's design question goes to the main session, which asks the user with AskUserQuestion. The chapters, the mocks and this plan are the only design sources.

## 2. Scope

**Everything in the ten chapters ships in beta.9:** all 135 items, every mock the user approved, the rules R-A to R-F, R-C+ and R-D+, all 56 decisions, eight migrations, eight ADRs, the system.md, GLOSSARY and spec amendments, and the guard rules. Size alone defers nothing.

The decisions also say what is **not built**: the "Keep the next days as planned" setting (PC 1), the 7-column week grid (PC 2 option A), the bulk Attendance sheet (PC 3) and a toast-only Undo (SAFE 2). None of these is a deferral.

### Deferred (needs the user's nod)

| What | Why it is not made safe in this release | Proposed |
|---|---|---|
| RES-04's **optional** route splitting (res.md "P6", `app/features.ts`, lazy feature chunks) | RES-04 itself (compression, immutable caching, the bundle budget) ships. Splitting the bundle in the same release that replaces the service worker (RES-01, RES-10) means stale chunk names under an old worker. A device could boot half old and half new, and nobody can test that without real devices. The chapter marks the split as optional, after the update prompt has shipped. | 1.0.0-beta.10, once beta.9's update prompt is in every installed copy |

Nothing else is deferred. Two items are the riskiest, RES-03 (offline Ticks) and SAFE-03 (Undo Cooked). Both have backend-first packages and their own tests, and the release QA walks them.

## 3. Packages

B9-01 to B9-57 are listed below with their waves. Size: S ≤ ½ day, M ≈ 1 day, L ≈ 2 days. "Owns" is exclusive while the package is in flight. Files outside "Owns" are read-only for the team. A team that needs one hands it back. Mocks are under `ui-review-3/mocks/` and renders under `ui-review-3/shots/`. `<id>-after-*` means every "after" render of that item.

| Id | Slug | Title | Items | Owns (exclusive) | Backend / API / migration | Visual acceptance | Size | Depends on | Wave |
|---|---|---|---|---|---|---|---|---|---|
| B9-01 | ds-actions | Action primitives and their sweep | DS-12 (R-A, R-B, R-D, R-D+, R-E `DetailList`); DS-03 `Button iconOnly` | `ui/Button.*`, `ui/IconButton.*`, new `ui/CloseButton.*`, new `ui/DetailList.*`, new `ui/lib/actionSurface.ts`, `ui/BottomSheet.*` (header, footer, `onCancel`), `ui/Dialog.*`, `ui/ConfirmDialog.tsx`, `ui/FormActions.tsx`, `ui/Toast.*` (anatomy), `ui/Tile.tsx`, `ui/OfflineBanner.tsx`, `ui/Gallery*.tsx`, `ui/index.ts`, `theme/contrast.test.ts`; sweep: one-attribute variant, `onCancel` and rich-toast changes in `features/**/*.tsx` and their tests; new files `scripts/check-ui.d/{button-variant,close-button,sheet-cancel,bullet-notice}.*`, `scripts/lib/page-layout/rules/P29-*.mjs`, `P30-*.mjs` | none | `mocks/pc-01-toast-variants.html`, `mocks/short-00-rules.html`, `mocks/safe-00-patterns.html`, `mocks/pc-09-meal-sheet*.html`; `shots/pc-01-after-*`, `shots/safe-00-patterns-1200-light.webp` | L | B9-03 (merged first in the batch) | 0 |
| B9-02 | tokens-type | Tokens, tones, type roles, rem | DS-06 (tokens), DS-07 (base and new type primitives), DS-08, A11Y-12 (dark danger fill); every new token | `styles.css` (all of it in W0), `theme/palette.ts`, `theme/palette.test.ts`, `theme/palette.golden.ts`, `theme/tokens.css.test.ts`, new `theme/contrast.tokens.test.ts`, new `ui/SectionTitle.*`, `ui/TileHeader.*`, `ui/Muted.*`, `ui/Overline.*`, `ui/Stack.*`; rule module `P27-*` | none | `shots/ds-06-after-*`, `ds-07-after-*`, `ds-08-after-*`; `mocks/ds-06-tone-specimen.html` | M | none | 0 |
| B9-03 | guard-split | Guard infrastructure, 320 profile | the guard hooks every package hangs on (DS-A's 320 profile, the 430 viewport, the short and inset viewports) | `scripts/check-ui.sh`, `scripts/check-ui.rules`, `scripts/check-page-layout.mjs`, `scripts/check-page-layout.sh`, `scripts/check-page-layout.modes`, `scripts/lib/page-layout-rules.mjs` (split), new `scripts/lib/page-layout/**` (registry, `rules/`, `probes/`, `scenarios/`), new `scripts/check-ui.d/`, `scripts/check-ui.rules.d/`, `scripts/check-page-layout.modes.d/`, `scripts/test/fixtures/page-layout-seed.mjs` (split into `page-layout-seed/<area>.mjs`), `scripts/test/check-ui_test.sh` | none | n/a (no visual change; P1–P23 findings identical before and after) | M | none | 0 |
| B9-04 | removals-api | Remove Member and Meal Slot with history; the pre-1570 snapshot | SAFE-02 backend (Member, Meal Slot), SET-15 read | `internal/household/**`, `internal/plan/runner/sources.go`, `internal/plan/httpapi/names.go`, the meal-slot reads in `internal/course`, `internal/tag`, `internal/recipe/store/base.go`, `internal/cook/service/adapters.go`, `internal/shopping/httpapi/wiring.go`; `internal/db/db.go`, `internal/backup/backup.go`, `cmd/feeder/startup.go`; new `docs/dev/design/b9-snap.md`, `scripts/test/b9-snap_test.sh`, `scripts/test/b5-snap_test.sh` | **1570**, **1571**; `Pre1570Prefixes` lists `1570_`…`1577_`; `GET /api/members/{id}/impact`, `…/restore`, `GET /api/meal-slots/{id}/impact`, `POST /api/meal-slots/{id}/restore`, removed-slots read | n/a (API) | L | none | 0 |
| B9-05 | stock-undo-api | Stock give-back, waste and Stock-take Undo, Move many, Keep with a date | SAFE-03 (`GiveBack`), SAFE-09 backend, SSP-10, SSP-17, SSP-01 (`AdjustLot`) backend | `internal/stock/**`, `internal/scan/service/**` (stock_take undo only) | **1572**; `POST /api/stock/waste/{id}/undo`, scan stock_take undo, `MoveMany`, `KeepOn(date)` | n/a | M | B9-04 (prefix list, merged first) | 0 |
| B9-06 | catalogue-api | Prices by Shop, priced fallback, barcode check, catalogue impact | SET-02, SET-04 (server check digit), SSP-13, SSP-14 (`plannedMeals`), SAFE-02 Shop and Ingredient impact reads | `internal/product/**`, `internal/shop/**`, `internal/ingredient/**` (impact read), `internal/shopping/service/**` (pricing and `plannedMeals` only; **not** `httpapi/wiring.go`) | Prices by Shop read; `PricedPacks`; Line `plannedMeals`; Shop and Ingredient impact | n/a | M | none | 0 |
| B9-07 | sweep-ui-app | Focus layer, em breakpoints and clean-up in `ui/` and `app/` | A11Y-02 core (R-C, R-C+), A11Y-03, TB-05, DS-09, DS-11 (ui, app), DS-07 (`.pg__*` into ui) | every `:focus-visible` rule and width media query in `ui/**/*.css`, `ui/Tile.css`, `app/shell.css` (focus, em, 1024 handover seam), new `ui/lib/breakpoints.ts`, the `useMediaQuery` callers in `ui/` and `app/`, `styles.css` (global ring and the removal of `--focus-ring` only), the ring block of `theme/contrast.test.ts`, `ui/fields/focusRing.css.test.ts`; check-ui `focus-ring`, `scheme-attr`, `raw-radius`, `raw-spacing`, `media-width` and the wider `opacity-muting` (`scripts/check-ui.d/*`); rules P26, P39 | none | `shots/a11y-02-after-*`, `a11y-03-after-*`, `tb-05-after-*`, `ds-09-after-*`, `ds-11-after-*`; `mocks/a11y-02-nested-focus.html` | L | W0 | 1 |
| B9-08 | sweep-plan-cook | The same sweep in Plan, Cook, Today, board, notifications, access, sign-in | A11Y-02, TB-05 (TonightHero and `.board-tonight`), DS-05 (`plan.css` 330–339), DS-07, DS-09, DS-11 there | `features/{plan,cook,today,board,notifications,access,signin}/**/*.css`, the `useMediaQuery` callers there; split `features/plan/strings.ts` into `features/plan/strings/{grid,sheets,hero,rules,away,cook}.ts` (re-exported) | none | `shots/ds-05-after-*`, `tb-05-after-*` | M | W0; merges after B9-07 | 1 |
| B9-09 | sweep-shop-stock | The same sweep in Shop, Scan, Stock, Receipt and the catalogue | as B9-08 | `features/{shop,scan,stock,receipt,ingredients,products,shops}/**/*.css`, the `useMediaQuery` callers there | none | `shots/ds-10-after-*` (spacing) | M | W0; merges after B9-07 | 1 |
| B9-10 | sweep-recipes-settings | The same sweep in Recipes, Import, Assistant, Settings, Tags; the file splits | as B9-08; RX WP-RX-0; DS-04 (`.tag-input`) | `features/{recipes,import,recipe-assistant,settings,tags}/**/*.css`, the `useMediaQuery` callers there; split `recipes.css` into `recipes-list.css`, `recipe-detail.css`, `recipe-editor.css`; split `features/recipes/strings.ts` into `strings/{list,detail,editor}.ts`; split `features/settings/strings.ts` into `strings/{members,household,slots,allowlist,preferences,courses,hub}.ts` (all re-exported) | none | `shots/ds-04-after-*`, `ds-07-after-*` | M | W0; merges after B9-07 | 1 |
| B9-11 | plan-undo-api | What changed, Undo Cooked and Regenerate Undo | PC-01, SAFE-03, SAFE-07 backend | `internal/plan/runner/**` (except `sources.go`), `internal/plan/store/**`, `internal/plan/httpapi/**` (except `names.go`), `internal/plan/plan.go`, `internal/planner/state.go`, the `plan.invalidate` event | **1573** `cooked_takes`, **1574** `plan_snapshots` and `plan_state.revision`; responses carry `changes[]` and `undoToken`; `POST /api/plan/restore`; `…/reopen` | n/a | L | B9-04, B9-05 | 1 |
| B9-12 | household-today-api | Earliest start, setup facts, Advance Steps source, notification URLs | PC-14 backend, TB-06 backend, TB-02 backend, TB-14 backend, RES-08's `householdTimeZone` | `internal/household/settings*` and its httpapi, `internal/planner/candidates.go`, `internal/planner/explain.go`, `internal/cook/advance.go`, `internal/cook/service/service.go`, `internal/today/httpapi/**`, `internal/notify/**`, the `/api/me` handler | **1575** (`earliest_start` default `'06:30'`, `setup_hidden`); `POST /api/meal-slots/batch`; marks-aware Advance Steps; notification URLs | n/a | L | B9-04 | 1 |
| B9-13 | listrow | ListRow, ListGroup and rows | slots and fixes for DS-01 (row target), DS-05, DS-10 (`metaLines`), A11Y-08 (row names), SET-03 (`actions`), SET-12 (`Avatar` neutral), SSP-03 (visible ListGroup heading), SSP-05 (meta container, compact Restock), PC-06 (`below`), RES-03 (`sync` prop) | `ui/ListRow.*`, `ui/ListGroup.*`, `ui/Avatar.*`, new `ui/SyncNotice.*`, `ui/LeftoverActions/LeftoverRow.tsx`, `lib/leftovers/rows.ts` (DS-05 part), `lib/restock.ts`; rules P24, P28, P40, P41 | none | `shots/ds-05-after-*`, `ssp-05-after-*`, `set-03-after-*`, `set-12-after-*`, `pc-06-after-*` | L | W1 | 2 |
| B9-14 | sheets | Sheets, dialogs, menus and popovers | DS-01 (portal, Menu as sheet), SHORT-02 and SHORT-07 (primitives), SAFE `confirmDismiss`, SET-A body padding (R-C), PC `context` prop, A11Y-07 libraries | `ui/BottomSheet.*`, `ui/Dialog.*`, `ui/Menu/**`, `ui/Popover/**`, `ui/FilterBar/FilterBar.css`, `ui/FormActions.*` (`more`, destructive slot, divider), new `ui/lib/sheetLayout.ts`, `ui/lib/useModalDialog.ts`, new `ui/lib/{focusSuccessor,useFocusKeeper,focusStepStart}.ts`; rules P25, P33; the P18 extension | none | `shots/ds-01-after-*`, `short-02-after-*`, `short-07-after-*`, `a11y-07-after-*` | L | W1 | 2 |
| B9-15 | select | The crafted Select | SET-06, SET-07 (Selects), DS-03 (Select and Sort `iconOnly`), DS-10 (Sort value), SAFE placeholder, RX-09 (create row) | `ui/Select/**` (incl. new `TimeZoneSelect`, `CurrencySelect`, `OptionList` create row), `ui/lib/useFittingChips.ts` (moved, re-exported), `ui/FilterBar/FilterBar.tsx`, `ui/FilterBar/useSortFits.ts`, `ui/FilterBar/lib/sortFits.ts`; P22 revision | none | `shots/set-06-after-*`, `set-07-tz-*`, `ds-03-after-*`; `mocks/set-06-recipe-select*.html` | L | W1 | 2 |
| B9-16 | controls | Fields, Segmented, IconButton states, targets | A11Y-05, A11Y-06 (fields, Segmented, ChoiceChip, IconButton pressed), A11Y-09 (IconSet, coarse blocks), A11Y-12 (TextArea), SAFE-04 primitives, SET-07 (field-size rule), PC-08 (`DateField rangeStart`), RX-08 and RX-02 (`DurationField`, `lib/time`, `Disclosure`), PC-03 (`Stepper` lg and 36 px) | `ui/fields/**`, `ui/IconButton.css`, new `ui/IconSet.*`, `ui/ChoiceChip.*`, `ui/icons.ts`, `ui/Stepper/**`, new `ui/Disclosure.*`, new `ui/lib/useAutoGrow.ts`, new `lib/time/**`, `ui/fields/{FieldFrame,FormError,focusFirstInvalid,useFocusFirstInvalid}.*`; check-ui `alert-in-form`; rule P36 | none | `shots/a11y-05-after-*`, `a11y-06-after-*`, `a11y-09-after-*`, `a11y-12-after-*`, `safe-04-after-*`; `mocks/a11y-05-field-boundaries.html`, `a11y-06-selected-states.html` | L | W1 | 2 |
| B9-17 | tiles-tones | Tile, Chip, timers and the viewfinder | DS-06 (Tile and Chip tones), DS-04 (chip max width), A11Y-06 and A11Y-09 (Chip), TB-03 (`Chip as="button"`), PC-03 and PC-04 (`TimerTile md`/`density`, new `TimerPill`), SSP-06 (`ViewfinderStrip`), `MemberPill` | `ui/Tile.css`, `ui/Chip.*`, `ui/TimerTile.*`, new `ui/TimerPill.*`, `ui/ViewfinderStrip.*`, `ui/MemberPill/**`, `ui/Tile.statusBorder.test.ts`, new `theme/contrast.tiles.test.ts`; check-ui `status-tone` + `scripts/check-ui.allow-tones`; `styles.css` (W2 owner, token fixes only) | none | `shots/ds-06-after-*`, `pc-04-after-*` (pill), `ssp-06-after-*` (strip); `mocks/pc-04-timer-pill.html`, `ds-06-warn-tone-plan.html` | M | W1 | 2 |
| B9-18 | toast-undo | Toast behaviour, Undo, leave guard, drafts | SAFE R1–R5 primitives (§14), SAFE 5 (8 s, pauses), SSP-12 (hold), SHORT toast offset | `ui/Toast.*` (behaviour, offsets), new `ui/useUndoToast.ts`, new `ui/useLeaveGuard.ts`, `ui/ConfirmDialog.tsx` (`groups`, `details`, `focus`), new `ui/DraftNotice.*`, new `lib/drafts/**`; check-ui `danger-sheet`; rule P43 | none | `mocks/safe-00-patterns.html`, `safe-01-leave-dialog*.html`, `ssp-12-keypad-no-toast.html` | M | W1 | 2 |
| B9-19 | shell-chrome | Bars, rail, safe areas, PageHeader | SHORT-04, SHORT-05, SHORT-08, DS-02 (R-F), DS-03 (PageHeader), A11Y-01 (title hooks and PageHeader), A11Y-06 (nav current), A11Y-09 (`.your-menu-button`), RX-03 (`PageHeader` basis) | `app/shell.css`, `app/AppShell.tsx`, new `ui/lib/{viewport,keyboard,useKeyboardInset,useDocumentTitle,pageTitle}.ts`, `ui/StickyActionBar.*`, `ui/useStickyBarClearance.ts`, `ui/Page.css`, `ui/PageHeader.*`, `web/index.html` (`viewport-fit`); `styles.css` (W3 owner); rules P31, P32, P35 | none | `shots/ds-02-after-*`, `short-04-after-*`, `short-05-after-*`, `short-08-after-*`, `ds-03-after-*`; `mocks/ds-02-bottom-bar*.html` | L | W2 | 3 |
| B9-20 | res-state | Unknown is not empty; errors in about 1 s | RES-02, RES-06, RES-05 (`householdDate`, `meCache`), RES-09 (`TileErrorBoundary`) | `app/providers.tsx`, new `lib/dataState.ts`, new `lib/errorCopy.ts`, `lib/http.ts`, new `lib/householdDate.ts`, new `app/meCache.ts`, new `ui/LoadState.*`, new `ui/Skeleton.*`, new `app/TileErrorBoundary.tsx`, the feature `errors.ts` files, the list and detail screens and hooks named in RES-02 (Recipes, Pantry, Plan, Recipe, Ingredient, Product, Shop, Settings lists), `ShoppingScreen.tsx` (error copy); new test files only | none | `shots/res-02-after-*`, `res-06-after-*`; `mocks/res-02-state*.html` | L | W2 | 3 |
| B9-21 | res-serving | Offline launch, compression, update prompt | RES-01, RES-04 (not the route split), RES-10, A11Y-12 (service worker), A11Y 4 | `internal/app/spa.go` and tests, `sw/**`, `web/vite.config.ts`, `features/scan/registerSw.ts` → `app/serviceWorker.ts`, new `app/useAppUpdate.ts`, `main.tsx` (registration line), `scripts/check.sh` (budget line), `deploy/helm/feeder/README.md` (headers note); check-ui offline-launch and header probes | `Cache-Control`, `Content-Encoding` | `shots/res-01-after-*`, `res-10-after-*` | M | W2 | 3 |
| B9-22 | units | Quantities in kg and l | SSP-16 | `lib/units.ts` and its tests; quantity expectations in existing feature **lib** tests | none | `shots/ssp-16-*`, `mocks/ssp-16-quantities.html` | S | W2 | 3 |
| B9-23 | ticks-api | A tick covers an amount; additions; offline sync | SSP-01, SSP-02, RES-03 backend | `internal/shopping/**` (except pricing, done in B9-06), `internal/scan/**` (queue and sync) | **1576** `shopping_tick_additions` (moves `lot_id`/`lot_quantity`), `covers`; tick JSON `{by, added}`, `more`; `PATCH /api/shopping/ticks`, `PATCH …/extras/{id}/tick`; `shop_tick` sync op | n/a | L | B9-05, B9-06 | 3 |
| B9-24 | away-api | Away on the Member | PC-08 backend | new `internal/away/**`, `internal/plan/runner/sources.go` (`away.Apply`), the slot-date read and attendance PUT (`despiteAway`), `GET /api/plan` `away` field (`internal/plan/httpapi/plan.go`) | **1577** `member_away`, `attendance_override_attendees.despite_away`; `/api/members/{id}/away`, `/api/away/{id}`; `household {changed:"away"}` | n/a | M | B9-04, B9-11 | 3 |
| B9-25 | timers-shell | Timers outside Cook Mode | PC-04 | `app/AppShell.tsx` (pill mount), new `app/hooks/useHouseholdTimers.ts`, `features/cook/hooks/useTimers.ts`, `features/cook/hooks/useCookSession.ts` (resume), new `features/cook/lib/resume.ts`, the pill and banner CSS | none | `shots/pc-04-after-*`; `mocks/pc-04-timer-pill.html`, `pc-04-timer-done.html` | M | B9-17, B9-19 | 4 |
| B9-26 | plan-undo-ui | What changed, Undo Cooked, Regenerate Undo | PC-01, SAFE-03, SAFE-07 UI | `features/plan/api.ts` (W4 owner), `hooks/{usePlanActions,usePlanLiveUpdates,usePlanScreen,useCookFlow,useNotCooked,useAllCookedFlow}.ts`, new `lib/{replan,regenerate,resolved}.ts`, new `components/ReplanReviewSheet.tsx`, `components/PlanCourseRow.tsx` (`data-changed` "was" text only), `components/PlannedMealSheet.tsx` (Undo Cooked only), `features/today/hooks/useToConfirm*.ts` | consumes B9-11 | `shots/pc-01-after-*`, `safe-03-after-*`, `safe-07-after-*`; `mocks/pc-01-replan-*.html`, `safe-03-*.html`, `safe-07-*.html` | L | B9-11, B9-18, B9-14 | 4 |
| B9-27 | recipe-detail | Recipe detail | RX-04, RX-05, RX-06, RX-07 (detail), RX-13, RX-14, SAFE-05, SHORT-04 (Cook bar), A11Y 3 (Exclusions) | `features/recipes/screens/RecipeDetailScreen.tsx`, `components/{RecipeMetrics,CookEntry,CookTile,RecipeAbout,IngredientLinesList,RecipeTags,IngredientExclusionList}.tsx`, `lib/{timeSummary,cookEntry,sourceLine,preference}.ts`, `recipe-detail.css`, `strings/detail.ts`; `internal/recipe/**` (`stepCount` in the summary, `deletable`) | list summary `stepCount`; `deletable` | `shots/rx-04-after-*`, `rx-05-*`, `rx-06-after-*`, `rx-07-after-*`, `rx-13-after-*`, `rx-14-after-*`, `safe-05-after-*`, `short-04-after-recipe-*` | L | B9-01, B9-13, B9-19 | 4 |
| B9-28 | import-export | Import, Import Review, Export | RX-01, RX-11, RX-12, RX-15 (Export) | `features/import/**`, `internal/recipefile/plan.go` and tests | Import plan returns the Recipes | `shots/rx-01-after-*`, `rx-11-after-*`, `rx-12-after-*`, `rx-15-after-export-*` | L | B9-01, B9-13 | 4 |
| B9-29 | pantry | Pantry by Storage Place, Put away, Keep, Stock Undo | SSP-03, SSP-05 (Pantry, Supplies), SSP-10, SSP-17, SAFE-09 (Throw out), SAFE-11 (Add Lot, Lot sheet), DS-03 (one prop), SHORT-07 (one rule), TB-11 (`lot` parameter) | `features/stock/**` **except** `components/ShortfallNotice.tsx` and `components/StockCorrectionSheet.tsx`; `features/ingredients/screens/SuppliesScreen.tsx`; check-ui `no-first-choice-default` | consumes B9-05 | `shots/ssp-03-after-*`, `ssp-05-after-*`, `ssp-10-after-*`, `ssp-17-after-*`, `safe-09-after-throwout-*`, `safe-11-after-lot-*` | L | B9-05, B9-13, B9-14, B9-15, B9-18 | 4 |
| B9-30 | shops-products | Shop and Product pages | SET-01, SET-02, SET-04, SET-13, SET-14a, SET-14b, SAFE-02 (Shop delete, Product archive and light removals), SAFE-04 (barcode, Shop and Weight Barcode Rule forms), SHORT-02 (WeightRuleEditor) | `features/shops/**`, `features/products/**`, `ui/Select/ProductSelect.tsx`, `ui/ImagePicker/**` | consumes B9-06 | `shots/set-01-after-*`, `set-02-after-*`, `set-04-after-*`, `set-13-*`, `set-14-after-*`, `safe-02-after-delete-shop-*` | L | B9-06, B9-15, B9-16 | 4 |
| B9-31 | editor-safety | The Recipe editor keeps work | SAFE-01, SAFE-04 (Recipe), SAFE-06, SAFE-10 | `features/recipes/screens/RecipeEditorScreen.tsx`, `hooks/useRecipeEditor.ts`, `lib/draft.ts`, the remove actions in `components/{IngredientLineRow,StepsEditor}.tsx`, `strings/editor.ts`; check-ui `no-history-back` | none | `shots/safe-01-after-*`, `safe-04-after-recipe-*`, `safe-06-after-*`, `safe-10-after-*` | L | B9-18, B9-16 | 5 |
| B9-32 | plan-grid | Week grid, rows, Couldn't plan, Plan names | PC-06, PC-07, PC-11 (B), PC-16 (6, 9), PC-14 (cause and warn chip), A11Y-08 (Plan, Pin toggle), A11Y-09 (IconSet on rows), DS-06 (Plan tones) | `features/plan/plan.css` (W5 owner), `components/{PlanGrid,DayTile,PlanCourseRow,CourseRow,PlanLeftovers,MarkCourseRecipesSheet,CouldntPlan*,SlotHeader,SlotMenu}.tsx`, `CourseRow.css`, `hooks/{usePlanCourseRow,usePlanGrid}.ts`, `lib/{rowChips,days,couldntGroups,actionNames}.ts`, `strings/grid.ts`, `api.ts` (W5 owner); `internal/course/**` (`POST /api/courses/{id}/recipes`); rule P38 | `POST /api/courses/{id}/recipes` | `shots/pc-06-after-*`, `pc-07-after-*`, `pc-11-after-*`, `pc-16-after-p6-*`, `a11y-08-after-*`, `a11y-09-after-*`; `mocks/pc-11-grid-b.html` | L | B9-26, B9-13, B9-16, B9-12 | 5 |
| B9-33 | recipes-list | Recipes list | RX-03, RX-07 (tile line), RX-15 (no-result), A11Y-11 | `features/recipes/screens/RecipesScreen.tsx`, `components/RecipeTile.tsx`, `lib/noResult.ts`, `recipes-list.css`, `strings/list.ts` | none | `shots/rx-03-after-*`, `rx-15-after-list-*`, `a11y-11-after-*` | M | B9-27 | 5 |
| B9-34 | shop-ticking | Tick by hand and the ticked row | SSP-01, SSP-02, SSP-18, SSP-05 (Shop rows), SAFE-09 (Shop), SAFE-11 (Add extra), A11Y-07 (focus after Tick and Not needed) | `features/shop/lib/{tickAmount,lines,rows}.ts`, `components/{TickSheet,LineRow,ExtraSheet}.tsx`, `components/LineSheet.tsx` (ticked mode), `hooks/{useTickFlow,useShoppingActions}.ts`, `screens/ShoppingScreen.tsx`, `ShoppingBody.tsx`, `shop.css`, `strings.ts`; `features/scan/lib/toGet.ts` (`tickRequest`), `features/scan/hooks/useToGetTick.ts`; check-ui focus-after-row scenario | consumes B9-23 | `shots/ssp-01-after-*`, `ssp-02-after-*`, `ssp-18-after-*`, `ssp-05-after-shop-*`, `safe-09-after-tick-*`, `safe-11-after-extra-*`, `a11y-07-after-shop-*` | L | B9-23, B9-22, B9-13, B9-18 | 5 |
| B9-35 | scan-camera | Scan without a camera; the keypad stays clear | SSP-06, SSP-12, SHORT-04 (Scan in landscape) | `features/scan/screens/ScanScreen.tsx`, `components/{CameraFailure,ManualBarcodeEntry,PriceEntrySheet}.tsx`, `hooks/{useTypedEntry,useScrollAboveSheet}.ts`, `scan.css`, `scan/strings.ts` | none | `shots/ssp-06-after-*`, `ssp-12-after-*`, `short-04-after-scan-*` | M | B9-17, B9-18, B9-19 | 5 |
| B9-36 | household-members | Members, Household and Your preferences | SAFE-02 (Member), SAFE-04 (Member sheet), SAFE-08, SET-07 (Household form), SHORT-02 (MemberEditor) | `features/settings/components/{MemberEditor,MemberList,HouseholdSettingsForm,MemberSheet}.tsx`, `hooks/useMembersPage.ts`, `PreferenceThemeProvider*`, new `lib/preferencePreview.ts`, `lib/{settingsForm,timezone}.ts`, `strings/{members,household,preferences}.ts`, `features/ingredients/hooks/useDisplayUnitSystem.ts`, `features/plan/hooks/useCookContext.ts` (one line), `app/YourMenu.tsx` (sign-out through the guard) | consumes B9-04 | `shots/safe-02-after-member-*`, `safe-02-after-footer-*`, `safe-04-after-member-*`, `safe-08-after-*`, `set-07-after-*`, `short-02-after-member-*` | L | B9-04, B9-14, B9-15, B9-18 | 5 |
| B9-37 | editor-flow | The Recipe editor as a faster flow | RX-02, RX-08 (editor), RX-09, RX-10, SHORT-08 (editor strip) | `features/recipes/screens/RecipeEditorScreen.tsx`, `components/{IngredientLineRow,StepsEditor,StepPhoto,PhotoPicker,RecipeDetailsFields*,TagChooser,RecipeEditorKind}.tsx`, `hooks/{useRecipeEditor,useTagChooser,useQuickCreateIngredient}.ts`, `lib/baseRecipe.ts`, `recipe-editor.css`, `strings/editor.ts` | none | `shots/rx-02-after-*`, `rx-08-after-*`, `rx-09-after-*`, `rx-10-after-*`, `short-08-after-*`; `mocks/rx-02-editor*.html`, `rx-09-tag-chooser*.html` | L | B9-31 | 6 |
| B9-38 | plan-sheets | Planned Meal, Swap, Choose a Recipe, Who's eating | PC-09, PC-10, PC-16 (8), RX-08 (Choose a Recipe), SHORT-02 (Plan sheets) | `features/plan/components/{PlannedMealSheet,SwapSheet,RecipeChooserSheet,SlotDateSheets,MarkCookedSheet,MarkAllCookedSheet}.tsx`, `lib/rowActions.ts`, `strings/sheets.ts`, `plan.css` (W6 owner), `api.ts` (W6 owner) | none | `shots/pc-09-after-*`, `pc-10-after-*`, `pc-16-after-p8-*`, `rx-08-after-choose-*`, `short-02-after-planned-*`, `short-02-after-mark-*`, `short-02-after-whos-*` | M | B9-26, B9-32, B9-14 | 6 |
| B9-39 | today-hero | The hero | TB-01, TB-10, TB-15b | `features/plan/lib/{hero,heroMenu}.ts`, `lib/days.ts` (hero helpers, W6 owner), `components/TonightHero.{tsx,css}`, `components/ToConfirmTile.tsx` (prepend), `strings/hero.ts` | consumes B9-12 | `shots/tb-01-*`, `tb-10-after-*`, `tb-15-*`; `mocks/tb-01-hero-timeline.html` | M | B9-32, B9-17 | 6 |
| B9-40 | cook-step | Cook Mode Step | PC-03, PC-12, PC-15, PC-16 (1–4), SHORT-01, DS-06 (Advance Steps info), A11Y-01 (Cook title) | `features/cook/**` **except** `hooks/{useTimers,useCookSession}.ts`, `lib/resume.ts`, `components/CookedConfirmation.tsx`, `components/GetReadyTile.tsx`, `components/IngredientsSheet.tsx`, `lib/ingredients.ts`, `lib/cook.ts`; new `lib/{tapZone,advanceChip}.ts`; rule P34 | none | `shots/pc-03-after-*`, `pc-12-after-*`, `pc-15-after-*`, `pc-16-after-p1..p4-*`, `short-01-after-*`; `mocks/pc-03-cook-step.html`, `short-01-cook-landscape*.html` | L | B9-17, B9-16, B9-25 | 6 |
| B9-41 | scan-data | Scan data: weighed codes, extras, unknown codes, Stock-take Undo | SSP-07, SSP-11, SSP-15, SSP-20, SAFE-09 (Stock-take), A11Y-07 (step focus) | `features/scan/lib/{unknownForm,barcode,scannedList}.ts`, `components/{NewProductSheet,NewProductLines,NewProductKind}.tsx`, `newProductStrings.ts`, `hooks/useScanFlow.ts` | consumes B9-05 | `shots/ssp-07-after-*`, `ssp-11-after-*`, `ssp-15-after-*`, `ssp-20-after-*`, `safe-09-after-stocktake-*` | M | B9-34, B9-35 | 6 |
| B9-42 | meal-slots | Meal Slots | SAFE-02 (Meal Slot), SET-08, SET-09, SET-10, SET-14h, SET-15, SHORT-02 (Edit Meal Slot, Date Attendance), A11Y-07 (Change a date) | `features/settings/components/{MealSlot*,RemovedMealSlots,AttendanceEditor,SlotCoursesField,DateAttendancePanel}.tsx`, `hooks/useMealSlotsPage.ts`, `lib/{mealSlotCards,slotForm,slotCourses}.ts`, `mealSlotCards.css`, `settings.css` (`.attendance*`), `strings/slots.ts`, `ui/CoursePicker/**` | consumes B9-04 | `shots/set-08-after-*`, `set-09-after-*`, `set-10-after-*`, `set-15-after-*`, `safe-02-after-remove-mealslot-*`, `safe-02-after-mealslot-removed-*`, `a11y-07-after-change-date-*`, `short-02-after-edit-slot-*` | L | B9-04, B9-13, B9-14 | 6 |
| B9-43 | shop-line-sheet | The open Line sheet, notice, complete | SSP-13, SSP-14, SSP-04, SSP-09 | `features/shop/components/LineSheet.tsx` (open mode), new `hooks/useSubstitute.ts`, `lib/notice.ts`, `components/{UnconfirmedNotice,CelebrationTile,ShopMetrics}.tsx`, `hooks/useUnsortedFromList.ts`, `shop.css` (notice and celebration blocks), `strings.ts`, new `ui/PriceSheet/**` (lifted from `scan/components/PriceEntrySheet.tsx`), `features/scan/components/ToGetList.tsx` (empty state) | consumes B9-06 | `shots/ssp-13-after-*`, `ssp-14-*`, `ssp-04-after-*`, `ssp-09-after-*` | L | B9-34, B9-35 | 7 |
| B9-44 | today-grid | Today's Bento | TB-02 (Today), TB-03, TB-08 (Today), TB-09, TB-11, TB-12, RES-05, RES-09 (tiles), PC-02 (Today wiring) | `features/today/**` **except** `lib/setup.ts`, `components/SetupChecklistTile*`, `hooks/useSetupChecklist.ts`, `setupSeam.ts`, `lib/currencyGuess.ts`, `hooks/useTodayLanding.ts`; `app/pageWidths.ts`, `features/plan/components/LeftoversTile.tsx`, `features/scan/lib/sessionStore.ts`; check-ui CLS probe; rule P42 | consumes B9-12 | `shots/tb-02-after-*`, `tb-03-*`, `tb-09-after-*`, `tb-11-after-*`, `tb-12-*`, `res-05-after-*`; `mocks/tb-today.html`, `tb-03-option-b.html`, `res-05-today-states.html` | L | B9-39, B9-20, B9-29, B9-45 (merge order) | 7 |
| B9-45 | cook-after | After cooking; Get ready | PC-02, PC-05, PC-13 | `features/cook/components/{CookedConfirmation,GetReadyTile,IngredientsSheet}.tsx`, `lib/{cook,ingredients}.ts`, `features/stock/components/{ShortfallNotice,StockCorrectionSheet}.tsx`, new `features/stock/lib/shortfall.ts`, new `hooks/useStockCorrection.ts`, `features/plan/hooks/useCookFlow.ts` (no-toast change), `lib/leftovers/{portions,sheetModel}.ts`, `lib/leftovers/rows.ts` (grouping), `ui/LeftoverActions/**` (Freeze sheet; not `LeftoverRow.tsx`) | none | `shots/pc-02-after-*`, `pc-05-after-*`, `pc-13-after-*`; `mocks/pc-02-*.html`, `pc-05-*.html`, `pc-13-*.html` | L | B9-40, B9-26 | 7 |
| B9-46 | away-ui | Away and Who's eating on the day | PC-08 UI, SET-16 | new `features/plan/lib/{away,slotDate}.ts`, new `hooks/{useAway,useMemberAways}.ts`, new `components/AwaySheet.tsx`, `DayTile.tsx`, `SlotHeader.tsx`, `SlotMenu.tsx`, `SlotDateSheets.tsx` (Who's eating `despiteAway`), `strings/away.ts`, `plan.css` (W7 owner), `api.ts` (W7 owner); `features/settings/components/{MemberList,MemberAwaySection}.tsx`, `MemberEditor.tsx` (Away section), new `features/settings/lib/away.ts` | consumes B9-24 | `shots/pc-08-after-*`, `set-16-after-*`; `mocks/pc-08-*.html`, `set-16-members-away*.html` | L | B9-24, B9-32, B9-38, B9-36 | 7 |
| B9-47 | board | Kitchen board | TB-04, TB-07, TB-08 (board), TB-15c (board error), TB-15d, SHORT-03, A11Y-12 (board h1), RES-09 (board tiles) | `features/board/**`; `styles.css` (W7 owner, board token block only) | none | `shots/tb-04-after-*`, `tb-07-after-*`, `short-03-after-*`; `mocks/tb-board*.html`, `short-03-board-landscape*.html` | L | B9-39, B9-20 | 7 |
| B9-48 | ingredients | Ingredient and Supply pages | SET-05, SET-13 (Ingredient), SET-14e, SAFE-02 (Ingredient delete, light removals), SAFE-04 (Unit Conversions) | `features/ingredients/**` **except** `screens/SuppliesScreen.tsx` and `hooks/useDisplayUnitSystem.ts` | consumes B9-06 | `shots/set-05-after-*`, `set-05-rename-*`, `safe-02-after-delete-ingredient-*` | M | B9-06, B9-16 | 7 |
| B9-49 | shell-boot | Route titles and focus, skip link, boot, offline banner, notifications | A11Y-01 (route), A11Y-10, A11Y-12 (nav and menu names), RES-07, RES-08, RES-09 (page), TB-13, TB-14, TB-15a, TB-15c (page), SET-14g, SHORT-05 (banner insets) | `app/AppShell.tsx` (W8), `app/shell.css` (W8), `app/strings.ts`, `app/YourMenu.tsx`, new `app/{routeTitle,useRouteFocus,navCurrent}.ts`, `app/useServiceWorkerNavigate.ts`, `app/AppRoot.tsx`, new `app/BootShell.tsx`, `app/ShellStatus.tsx`, new `app/useShellStatus.ts`, `app/useConnectivity.ts`, `app/PageErrorBoundary.tsx`, `theme/{themeCache,usePreferenceTheme}.ts`, `web/index.html`, `main.tsx`, `ui/OfflineBanner.*`, `features/notifications/**`, `features/signin/**` (title), `features/today/hooks/useTodayLanding.ts`; rule P37 | consumes B9-12 | `shots/a11y-01-*`, `a11y-10-after-*`, `res-07-after-*`, `res-08-after-*`, `res-09-after-*`, `tb-13-after-*`, `tb-15-*`; `mocks/tb-14-landings.html`, `a11y-10-skip-link*.html` | L | B9-44, B9-25, B9-36 | 8 |
| B9-50 | receipt | Receipt review | SSP-08, SSP-19, A11Y-09 (receipt row) | `features/receipt/**`, `features/scan/components/NewProductSheet.tsx` (`receiptLine` and `matches` props), `internal/receipt/**` (adds with `productId`) | receipt add with `productId` | `shots/ssp-08-after-*`, `ssp-19-after-*` | M | B9-41 | 8 |
| B9-51 | settings-small | Tags, Courses, Planning rules, Assistant, Settings hub | SET-11, SET-14c, SET-14d, SET-14f, SHORT-06, PC-14 (Earliest start field), SAFE-04 (rule forms), SAFE-02 (rule light removals), DS-10 (hub) | `features/tags/**`, `ui/TagColour/TagSwatch.tsx`, `features/settings/components/CourseRow.tsx`, `coursesStrings.ts`, `strings/{courses,hub}.ts`, the Settings hub screen, `features/plan/screens/PlanningRulesScreen.tsx`, `features/plan/components/RulesEditors.tsx`, `hooks/{useRules,useRuleForms}.ts`, `features/plan/strings/rules.ts`, `features/recipe-assistant/**` | consumes B9-12 | `shots/set-11-after-*`, `set-14-after-*`, `pc-14-after-*`, `short-06-after-*`, `ds-10-after-settings-*`, `safe-04-after-slotrule-*` | M | B9-12, B9-19, B9-13 | 8 |
| B9-52 | allowlist-access | Allowlist and Sign-in requests | SET-03, SET-12, TB-15e | `features/settings/components/AllowlistPanel.tsx`, `lib/allowlist.ts`, `strings/allowlist.ts`, new `ui/lib/{useCopyText,useShareText}.ts`, `features/access/**`; check-ui `word-break` gains `overflow-wrap: anywhere` | none | `shots/set-03-after-*`, `set-12-after-*`; `mocks/set-03-allowlist*.html`, `set-12-access*.html` | M | B9-13, B9-18 | 8 |
| B9-53 | first-run | First run as a flow | TB-06 | `features/today/lib/setup.ts`, `components/SetupChecklistTile*` (+ step parts), `hooks/useSetupChecklist.ts`, `setupSeam.ts`, new `lib/currencyGuess.ts`, new `features/settings/components/MealSlotQuickStartSheet.tsx` | consumes B9-12 | `shots/tb-06-after-*`; `mocks/tb-06-step*.html` | L | B9-44, B9-15, B9-36 | 8 |
| B9-54 | offline-shop | Offline shopping | RES-03 UI | `features/scan/lib/queue.ts`, `hooks/useSyncQueue.ts`, `features/shop/lib/pendingTicks.ts`, the additions list in `features/shop/components/LineSheet.tsx`, the offline branch of `hooks/useTickFlow.ts`, the pending count in `app/useShellStatus.ts`; check-ui offline tick scenario | consumes B9-23 | `shots/res-03-after-*`; `mocks/res-03-shop-offline.html`, `res-03-scan-offline.html` | L | B9-43, B9-41, B9-49 | 9 |
| B9-55 | a11y-finish | Forced colours and the guard flips | A11Y-04; flips every rule and route to fail | new `ui/forcedColors.css`, `ui/index.ts` (one import and the W2 barrel lines), `scripts/test/ds-layout` fixture, `scripts/check-ui.allow-tones` (empty or justified), all `*.rules.d` and `*.modes.d` mode flips | none | `shots/a11y-04-after-*`; `mocks/a11y-04-forced-*.html` | M | all of W0–W8, B9-54 | 9 |
| B9-56 | docs | system.md, GLOSSARY, spec, ADRs | section 8 | `docs/design/system.md`, `GLOSSARY.md`, `docs/spec/functional-spec.md`, `docs/spec/recipe-file.md` (RX 3 note), `docs/design/ux-brief.md` (TB 5 line), `docs/design/shop-scan-proposals.md` §13.11 note, new `docs/adr/0020…0027-*.md`, `docs/adr/0016-*.md` and `0019-*.md` ("amended by" lines) | none | n/a | M | W9 closed | 10 |
| B9-57 | release | 1.0.0-beta.9 | section 10 | `CHANGELOG.md`, `deploy/helm/feeder/Chart.yaml`, `deploy/helm/feeder/README.md`, `docs/dev/deploy.md` | none | release QA | M | B9-56 | 10 |

### 3.1 Item coverage

Every item is built by the packages named below. A comma means the item is split across packages, and every package named is needed.

- **PC:**
- PC-01: B9-11, B9-26
- PC-02: B9-45 (Today wiring in B9-44)
- PC-03: B9-40 (with B9-16 and B9-17)
- PC-04: B9-25
- PC-05: B9-45
- PC-06: B9-13, B9-32
- PC-07: B9-32
- PC-08: B9-24, B9-46
- PC-09: B9-38
- PC-10: B9-38
- PC-11: B9-32
- PC-12: B9-40
- PC-13: B9-45
- PC-14: B9-12, B9-32, B9-51
- PC-15: B9-40
- PC-16: items 1–4 in B9-40, 6 and 9 in B9-32, 8 in B9-38
- **SSP:**
- SSP-01: B9-05, B9-23, B9-34
- SSP-02: B9-23, B9-34
- SSP-03: B9-13, B9-29
- SSP-04: B9-43
- SSP-05: B9-13, B9-29, B9-34
- SSP-06: B9-17, B9-35
- SSP-07: B9-41
- SSP-08: B9-50
- SSP-09: B9-43
- SSP-10: B9-05, B9-29
- SSP-11: B9-41
- SSP-12: B9-18, B9-35
- SSP-13: B9-06, B9-43
- SSP-14: B9-06, B9-43
- SSP-15: B9-41
- SSP-16: B9-22
- SSP-17: B9-05, B9-29
- SSP-18: B9-34
- SSP-19: B9-50
- SSP-20: B9-41
- **TB:**
- TB-01: B9-39
- TB-02: B9-12, B9-44, B9-47
- TB-03: B9-44
- TB-04: B9-47
- TB-05: B9-07, B9-08
- TB-06: B9-12, B9-53
- TB-07: B9-47
- TB-08: B9-44, B9-47
- TB-09: B9-44
- TB-10: B9-39
- TB-11: B9-29, B9-44
- TB-12: B9-44
- TB-13: B9-49
- TB-14: B9-12, B9-49
- TB-15: a in B9-49, b in B9-39, c in B9-49 and B9-47, d in B9-47, e in B9-52
- **RX:**
- RX-01: B9-28
- RX-02: B9-37
- RX-03: B9-33 (basis in B9-19)
- RX-04: B9-27
- RX-05: B9-27
- RX-06: B9-27
- RX-07: B9-27, B9-33
- RX-08: B9-16, B9-37, B9-38
- RX-09: B9-15, B9-37
- RX-10: B9-37
- RX-11: B9-28
- RX-12: B9-28
- RX-13: B9-27
- RX-14: B9-27
- RX-15: B9-33, B9-28
- **SET:**
- SET-01: B9-15, B9-30
- SET-02: B9-06, B9-30
- SET-03: B9-13, B9-52
- SET-04: B9-06, B9-30
- SET-05: B9-48
- SET-06: B9-15
- SET-07: B9-15, B9-16, B9-36
- SET-08: B9-42
- SET-09: B9-42
- SET-10: B9-42
- SET-11: B9-51
- SET-12: B9-13, B9-52
- SET-13: B9-30, B9-48
- SET-14: a and b in B9-30, c, d and f in B9-51, e in B9-48, g in B9-49, h in B9-42
- SET-15: B9-04, B9-42
- SET-16: B9-46
- **SAFE:**
- SAFE-01: B9-18, B9-31
- SAFE-02: B9-04, B9-06, B9-30, B9-36, B9-42, B9-48, B9-51
- SAFE-03: B9-05, B9-11, B9-26
- SAFE-04: B9-16, B9-31, B9-36, B9-30, B9-48, B9-51
- SAFE-05: B9-27
- SAFE-06: B9-31
- SAFE-07: B9-11, B9-26
- SAFE-08: B9-36
- SAFE-09: B9-05, B9-29, B9-34, B9-41
- SAFE-10: B9-31
- SAFE-11: B9-29, B9-34
- **SHORT:**
- SHORT-01: B9-40
- SHORT-02: B9-14 (adoption in B9-30, B9-36, B9-38 and B9-42)
- SHORT-03: B9-47
- SHORT-04: B9-19, B9-27, B9-35
- SHORT-05: B9-19, B9-49
- SHORT-06: B9-51
- SHORT-07: B9-14, B9-29
- SHORT-08: B9-19, B9-37
- **A11Y:**
- A11Y-01: B9-19, B9-49
- A11Y-02: B9-07, B9-08, B9-09, B9-10
- A11Y-03: B9-07
- A11Y-04: B9-55
- A11Y-05: B9-16
- A11Y-06: B9-16, B9-17, B9-19
- A11Y-07: B9-14, B9-34, B9-41, B9-42
- A11Y-08: B9-13, B9-32
- A11Y-09: B9-16, B9-17, B9-19, B9-32, B9-50
- A11Y-10: B9-49
- A11Y-11: B9-33
- A11Y-12: B9-02, B9-16, B9-21, B9-47, B9-49
- **DS:**
- DS-01: B9-13, B9-14
- DS-02: B9-19
- DS-03: B9-01, B9-15, B9-19, B9-29
- DS-04: B9-17, B9-10
- DS-05: B9-08, B9-13
- DS-06: B9-02, B9-17, and each feature package for its own tone sites
- DS-07: B9-02, B9-07–B9-10
- DS-08: B9-02
- DS-09: B9-07–B9-10
- DS-10: B9-13, B9-15, B9-51
- DS-11: B9-07–B9-10
- DS-12: B9-01
- **RES:**
- RES-01: B9-21
- RES-02: B9-20
- RES-03: B9-23, B9-54
- RES-04: B9-21
- RES-05: B9-20, B9-44
- RES-06: B9-20
- RES-07: B9-49
- RES-08: B9-12, B9-49
- RES-09: B9-20, B9-44, B9-47, B9-49
- RES-10: B9-21

## 4. Waves

The cap is 6 teams. Within a wave every package is file-disjoint from the others, and section 5 has the exceptions that are sequenced inside a batch. The check-runner integrates each wave in the order given.

| Wave | Packages (teams) | Why together | Integration batch(es) and merge order |
|---|---|---|---|
| **W0 Foundations** | B9-01, B9-02, B9-03, B9-04, B9-05, B9-06 (6) | Nobody starts UI work before the action primitives, the tokens, the guard split and the snapshot exist. B9-01 is the only package that edits `features/*.tsx`. The three backend packages touch only `internal/` and `cmd/`. | `ci/b9-w0a`: B9-03, B9-02, B9-04, which land first (B9-03 and B9-04 are expected on day 1). `ci/b9-w0b`: B9-05, B9-06, then B9-01, which rebases on w0a before adding its rule files and the index lines for B9-02's primitives. |
| **W1 Sweeps and core APIs** | B9-07, B9-08, B9-09, B9-10, B9-11, B9-12 (6) | The focus ring, em breakpoints, raw values and strings are split by folder, so four teams sweep at once. The plan and household APIs land before their UI. | `ci/b9-w1`: B9-07 first (it defines the ring, the hero rule and the check-ui detectors), then B9-08, B9-09, B9-10 and B9-11, B9-12. The W1 close runs `PAGE_LAYOUT=full`, which retires the em/rem risk. |
| **W2 Primitives** | B9-13, B9-14, B9-15, B9-16, B9-17, B9-18 (6) | Every primitive change that features need, one owner per file. No feature files. | `ci/b9-w2`, any order, all six together. New primitives are imported by their own path until B9-55 adds the barrel lines; nobody edits `ui/index.ts` in W2. The W2 close runs `PAGE_LAYOUT=full`. |
| **W3 Shell, state and remaining APIs** | B9-19, B9-20, B9-21, B9-22, B9-23, B9-24 (6) | Shell chrome, the state model and serving land before screens. The last two migrations land. | `ci/b9-w3`: B9-23 and B9-24 first (migrations), then B9-21, B9-22, B9-20, B9-19. After W3 every 157x migration is on `main`. |
| **W4 First screens** | B9-25, B9-26, B9-27, B9-28, B9-29, B9-30 (6) | Disjoint feature folders: cook hooks, plan writes, Recipe detail, import, stock, shops and products. | `ci/b9-w4`, any order. |
| **W5** | B9-31, B9-32, B9-33, B9-34, B9-35, B9-36 (6) | Editor safety, plan grid, Recipes list, Shop ticking, Scan camera, Members. | `ci/b9-w5`, any order. |
| **W6** | B9-37, B9-38, B9-39, B9-40, B9-41, B9-42 (6) | Editor flow, plan sheets, hero, Cook Step, scan data, Meal Slots. `plan.css` and `api.ts` belong to B9-38 in this wave, so the hero styles stay in `TonightHero.css`. | `ci/b9-w6`, any order. |
| **W7** | B9-43, B9-44, B9-45, B9-46, B9-47, B9-48 (6) | Line sheet, Today grid, after cooking, Away, board, Ingredients. | `ci/b9-w7`: B9-45 before B9-44 (Today wires the new `ShortfallNotice` in its last commit after the rebase), the rest in any order. |
| **W8** | B9-49, B9-50, B9-51, B9-52, B9-53 (5) | Shell-level a11y and boot, receipt, the small Settings items, Allowlist, first run. | `ci/b9-w8`, any order. |
| **W9 Finish** | B9-54, B9-55 (2) | Offline Ticks need the Line sheet, scan data and the shell status. The guard flips need everything. | `ci/b9-w9`: B9-54, then B9-55. Full `PAGE_LAYOUT=full`. |
| **W10 Docs and release** | B9-56, then B9-57 (1 at a time) | Docs written against the merged code, then the release. | `ci/b9-w10`: B9-56, then the release commit. Full check, `make docker`, then the tag. |

## 5. Shared files: who edits, in which order

Only one package edits a shared file at a time. After the last owner listed, the file is frozen for beta.9: a package that needs a change there hands it back, and the main session assigns it.

| File | Order of owners |
|---|---|
| `styles.css` | B9-02 (W0, every new token) → B9-07 (W1, global ring, `--focus-ring` removed) → B9-17 (W2, token fixes) → B9-19 (W3) → B9-47 (W7, board block only) |
| `theme/palette.ts` | B9-02 only |
| `theme/contrast.test.ts` | B9-01 (W0) → B9-07 (W1, ring block). Every other package adds `theme/contrast.<slug>.test.ts`. |
| `ui/Button.*`, `ui/CloseButton.*`, `ui/DetailList.*`, `ui/Dialog.tsx` (R-B) | B9-01 → (`Dialog` only) B9-14 |
| `ui/IconButton.*` | B9-01 (R-A) → B9-07 (focus) → B9-16 (pressed, coarse, 36 px nested) |
| `ui/Toast.*` | B9-01 (anatomy, R-D, R-D+) → B9-07 (focus line) → B9-18 (behaviour, 8 s, pauses, offsets, hold) |
| `ui/BottomSheet.*` | B9-01 (header, footer, `onCancel`) → B9-07 (focus, ring room) → B9-14 (portal, short layout, `confirmDismiss`, body padding, `context`) |
| `ui/FormActions.*` | B9-01 (R-A variants) → B9-14 (`more`, destructive slot, divider) |
| `ui/ConfirmDialog.tsx` | B9-01 (outline Cancel, no Close) → B9-18 (`groups`, `details`, focus) |
| `ui/ListRow.*`, `ui/ListGroup.*` | B9-07 (focus, em) → B9-13 (every slot and fix; nothing after) |
| `ui/Select/**` | B9-07 → B9-15 → B9-30 (`ProductSelect.tsx` only) |
| `ui/Tile.*`, `ui/Chip.*` | B9-01 (`Tile.tsx`) → B9-07 (`Tile.css` focus and hero) → B9-17 |
| `ui/fields/**`, `Segmented` | B9-07 → B9-16 |
| `ui/StickyActionBar.*`, `ui/PageHeader.*`, `ui/Page.css` | B9-07 → B9-19 |
| `ui/OfflineBanner.*` | B9-01 (R-A) → B9-49 |
| `ui/index.ts` | B9-01 (W0, including B9-02's primitives) → B9-55 (W9, the forced-colours import and every W2/W3 barrel line) |
| `app/shell.css` | B9-07 (focus, em, seam) → B9-19 (R-F, compact rail, keyboard, insets) → B9-49 (skip link, banner) |
| `app/AppShell.tsx` | B9-19 → B9-25 (timer pill) → B9-49 |
| `app/YourMenu.tsx` | B9-36 (sign-out guard) → B9-49 (names) |
| `features/plan/api.ts` | B9-26 (W4) → B9-32 (W5) → B9-38 (W6) → B9-46 (W7) |
| `features/plan/plan.css` | B9-08 → B9-32 → B9-38 → B9-46 |
| `features/plan/components/PlannedMealSheet.tsx` | B9-26 → B9-38 |
| `features/plan/components/DayTile.tsx`, `SlotHeader.tsx`, `SlotMenu.tsx` | B9-32 → B9-46 |
| `features/plan/hooks/useCookFlow.ts` | B9-26 → B9-45 |
| `features/shop/components/LineSheet.tsx` | B9-34 (ticked) → B9-43 (open) → B9-54 (additions list) |
| `features/scan/components/NewProductSheet.tsx` | B9-41 → B9-50 |
| `features/settings/components/MemberEditor.tsx` | B9-36 → B9-46 (Away section) |
| `features/cook/**` | B9-08 (css) → B9-25 (hooks) → B9-40 → B9-45 |
| `internal/plan/runner/sources.go` | B9-04 → B9-24 |
| `internal/household/**` | B9-04 → B9-12 (settings) |
| `internal/shopping/**` | B9-04 (`httpapi/wiring.go`) and B9-06 (`service` pricing) in parallel on different files → B9-23 |
| `internal/stock/**`, `internal/scan/**` | B9-05 → B9-23 (`internal/scan` queue) |
| `scripts/check-ui.sh`, `check-page-layout.mjs`, `page-layout-rules.mjs` | B9-03 only. After W0 a package adds its **own** files under `scripts/check-ui.d/`, `scripts/check-ui.rules.d/`, `scripts/lib/page-layout/{rules,probes,scenarios}/`, `scripts/check-page-layout.modes.d/` and `scripts/test/fixtures/page-layout-seed/`, named `<slug>.*` or `Pnn-*`. |
| `scripts/check.sh` | B9-21 (budget line) only |

## 6. Package briefs

### Reviewer visual checklist (VC)

Every reviewer opens the package's mocks next to the running branch at the listed sizes, light and dark, using the same seed. They Tab through every control and look at close-up crops. The checklist comes from the user's review comments:

- **VC1 Buttons look like buttons (R-A).** Every action has a fill and a 1 px outline, or is solid. On a tint, the fill is `--color-surface`. No bare-text "Dismiss", "Cancel" or "Show more", and no pale button on a tinted tile.
- **VC2 Close (R-B).** It is a 40 px circle, never squashed or oversized, and the title sits centred on it. There is no Close when the footer has Cancel.
- **VC3 Focus (R-C, R-C+, A11Y-02).** A ring is never clipped by a header or a scroller, never overrun by a neighbour, and never fused with a second ring. The inner ring appears only in containers with under 9 px of padding (field frames, pills, rail timer tiles, chips holding buttons). In tiles and rows the ring is outer.
- **VC4 Toasts (R-D, R-D+).** A toast with detail has a headline, a muted subline, body text, then real buttons. A success toast has no icon, and a status icon sits left of the headline. One toast shows at a time, for 8 s, pausing on hover, focus and while the page is hidden (Scan keeps 5 s). A toast never covers the row being acted on.
- **VC5 Rows, not bullets (R-E).** The key is `body-strong`, the state is at the row's end with tabular figures, and the detail is muted. Read-only rows use `DetailList`, and rows the person acts on use `ListRow`. A dialog has a title, a lead, rows and a note, never a wall of paragraphs.
- **VC6 Shapes.** Nothing is squished, fused or touching. A "+N" counter is a 28 px circle. Squircles are square. Count badges are round. Chips keep their natural width or go into "+N", never a one-letter stub.
- **VC7 One line.** No Segmented option or short button label wraps. No element takes a whole line it does not need.
- **VC8 Weight.** Cook Mode's Step text is large at 500. A Step's sentence is never bold anywhere, and only short keys are `body-strong`. Display text read at length is not extra-bold.
- **VC9 Tones.** warn means a decision, info a question or a time to know (Advance Steps are always info, including the board's Next Advance Step), spoil means food and danger means loss.
- **VC10 Sizes.** Check 320×568, 390×844, 844×390, 820×1180 and 1440×900 plus the sizes the mocks name, light and dark, and at least one accent other than the default.

A package's "done" always includes:
- its chapter tests (unit, Go, BDD) passing;
- its page-layout scenario and rule modules passing;
- `CHECK_ONLY=ui` clean for its folders, with its folders flipped to fail for the rules it cleans;
- no `_Avoid_` word from GLOSSARY in UI copy;
- the reviewer's VC pass, recorded in the approval with the sizes checked.

### W0

**B9-01 ds-actions.**
- **Done:** all of [DS-12](ui-review-3/ds.md#ds-12--actions-look-like-actions-button-iconbutton-close-toast-detail-rows-and-sheet-room-as-system-rules) is in place:
- `Button` variants `primary`, `secondary` and `danger` only (no tertiary, danger-tertiary or accent-secondary);
- `Button` `iconOnly="narrow"`;
- `IconButton` with a surface fill and an outline on tints, through `ActionSurface`;
- `CloseButton`;
- `BottomSheet`/`Dialog` with `onCancel` rendering an outline Cancel and no Close;
- `Toast` with `headline`, `subline`, `body` and `actions`;
- `DetailList`/`DetailRow` (key, state, detail).

The sweep changes every feature call site: variants, own Cancel buttons, and multi-sentence toasts converted to the rich anatomy. check-ui 13–16 fail everywhere, and P29/P30 are in `ALWAYS_FAIL`.
- **Traps:**
- This is the only W0 package that edits `features/**`, so its sweep stays mechanical and does no redesign.
- Behaviour of `useUndoToast` (timing, one at a time) belongs to B9-18, not here.
- Rule files go under B9-03's new directories, so rebase on w0a first.
- Add the `ui/index.ts` lines for B9-02's five type primitives.
- **Review:** VC1, VC2, VC4, VC5, VC7 on the Plan sheets, Today tiles, the Shop notice and Settings deletes at 390 and 1440, light and dark.

**B9-02 tokens-type.**
- **Done:**
- every new token in one place:
  - the warn tone (DS 3);
  - the status tones with info for Advance Steps;
  - the focus ring tokens `--focus-ring-*` and `--focus-ring-inner-width`;
  - `--safe-*`, `--bar-gap`, `--keyboard-inset`, `--rail-compact`;
  - `--text-step-weight: 500`;
  - `--tile-min-row`, `--tile-min-wide`, the gutter step;
  - radius and space tokens;
  - `--icon-set-gap` and `--target-min`;
  - the board token block;
- type tokens in rem and the body role and base headings (DS-07/08);
- the dark danger solid `#ba4f4b` and the outline guard over surface-3 and bg (A11Y-12);
- new `SectionTitle`, `TileHeader`, `Muted`, `Overline` and `Stack`;
- rule P27 (by mode) and the font-24 scenario.
- **Traps:**
- the existing `--focus-ring` stays until B9-07 removes it;
- the token names are fixed here: later packages use them and do not add their own;
- rem changes no rendered size at 16 px: `theme/tokens.css.test.ts` proves it.
- **Review:** VC8 and VC9 against `mocks/ds-06-tone-specimen.html` and `ds-08-rem-*`; a before/after page-layout run shows no geometry change at 100 %.

**B9-03 guard-split.**
- **Done:**
- `page-layout-rules.mjs` becomes a registry plus per-rule modules (`scripts/lib/page-layout/rules/Pnn-*.mjs`), per-probe in-page modules, per-package scenario modules and a seed split by area;
- `check-ui.sh` loads `scripts/check-ui.d/*` and `check-ui.rules.d/*`;
- `check-page-layout.sh` reads `check-page-layout.modes.d/*`;
- a `--scenario <name>` filter for targeted runs;
- profiles: 320×568 in quick and full, 430×932 and 844×390 in full, and the scenario-level viewports 568×320 and 320×256 (zoom);
- a hook for `Emulation.setSafeAreaInsetsOverride`;
- the registry reserves P24–P43 with their owners (section 9).
- **Traps:**
- P1–P23 must report exactly the same findings before and after: diff the JSON of a quick run on `main`;
- `scripts/test/check-ui_test.sh` keeps passing;
- the new 320 profile will show existing findings on warn routes, which is expected (warn).
- **Review:** the identical-findings diff; nothing else is visual.

**B9-04 removals-api.**
- **Done:**
- [SAFE-02](ui-review-3/safe.md#safe-02--destructive-settings-and-catalogue-actions-one-tap-deletes-and-five-confirm-patterns): `RemoveSlot` and `RestoreSlot` (with 409 `meal_slot_name_taken`), the Member snapshot and same-id restore with a deferred `ReleasePhoto`, the impact reads, and the active-slot filters at every read SAFE-02 lists;
- `Slot(id)` still returns a removed slot;
- the SET-15 removed-slots read;
- migrations 1570 (`meal_slots` rebuild with `removed_at`, the partial unique index, `meal_slot_removals`) and 1571 (`member_removals`);
- the pre-1570 snapshot (section 7);
- `docs/dev/design/b9-snap.md` in the b8-snap.md format;
- the Go tests SAFE-02 names, including `foreign_key_check` empty after the rebuild.
- **Traps:**
- 1570 is a parent-table rebuild with `foreign_keys=OFF`, like 1100 and 1400;
- `Pre1570Prefixes` lists all eight prefixes now, so B9-05, B9-11, B9-12, B9-23 and B9-24 never touch `db.go`;
- `wiring.go` is this package's file in W0, so B9-06 must not touch it.
- **Review:** the upgrade tests (beta.8, beta.7-skip, beta.4.2) and the restore idempotence tests.

**B9-05 stock-undo-api.**
- **Done:**
- `stock.GiveBack` and `Service.GiveBackTx` (the Lot exists, was emptied, or was deleted since);
- waste Undo (`lot_json`, which re-inserts the Lot with its id and dates, and brings the streak back);
- Scan Stock-take Undo (+1 removes its Lot, −1 gives back);
- `MoveMany` (SSP-10);
- `KeepOn(date)` (SSP-17: "Good until today" by default);
- `AdjustLot` for SSP-01's Change;
- migration 1572.
- **Traps:** same-day Undo only for waste. The 1572 file needs B9-04's prefix list, so it merges after B9-04.
- **Review:** the Go tables from SAFE-09 and SSP-17.

**B9-06 catalogue-api.**
- **Done:**
- Prices by Shop (SET-02);
- the barcode check digit for all-digit codes (SET 1);
- `PricedPacks` and the priced fallback (SSP 5: a Product's Price is used before a first purchase);
- `plannedMeals` on a Line (SSP-14);
- Shop and Ingredient impact reads for SAFE-02's confirms.
- **Traps:** it must not touch `internal/shopping/httpapi/wiring.go` (B9-04's file) or the tick code (B9-23's).
- **Review:** the Go tests in SET-02, SET-04 and SSP-13.

### W1

**B9-07 sweep-ui-app.**
- **Done:**
- [A11Y-02](ui-review-3/a11y.md#a11y-02--one-focus-ring-visible-on-every-container-never-clipped-overrun-or-fused): one ring as an outline, never a box-shadow; `data-focus-scope` on the bounded containers; field frames ring only while their text entry has focus; the nested rule (R-C+);
- A11Y-03 and TB-05: the hero's dark rule in `ui/Tile` keyed on `data-scheme`, with the ring in `currentColor` on the hero;
- DS-09: the em breakpoint table in `ui/lib/breakpoints.ts`, every width query in `ui/` and `app/` converted, and the 1024 px rail seam;
- DS-11 in `ui/` and `app/`;
- the check-ui detectors 17–19, 21 and 22 plus the wider `opacity-muting`, failing for `web/src/ui` and `web/src/app`;
- P26 (resize walk) and P39 (ring room), always fail.
- **Traps:**
- feature CSS belongs to B9-08–B9-10, which merge after this package;
- the `--focus-ring` removal must leave no reference anywhere: grep across `features/` and coordinate with the three sweeps through the batch order.
- **Review:** VC3 on every primitive in `mocks/a11y-02-nested-focus.html` for all 7 accents, light and dark; the hero at 390 and 1440 in both schemes, with the scheme chosen against the OS.

**B9-08, B9-09, B9-10 (sweeps by folder).**
- **Done:**
- for each folder: feature-local rings deleted or replaced by the token; width queries in em; raw radii, spacing and opacity replaced by tokens; `.pg__*` usage moved to the new type primitives;
- each package flips its folders to fail for `focus-ring`, `raw-radius`, `raw-spacing`, `media-width`, `opacity-muting` and `type-scale` in its own `.rules.d` file;
- B9-08 removes TonightHero's dark blocks and `.board-tonight` muted (TB-05) and fixes DS-05's `overflow: visible`;
- B9-10 does RX's WP-RX-0 splits and the settings strings split, keeping re-exports so no import breaks;
- B9-08 splits the plan strings.
- **Traps:**
- pure refactor plus rule fixes, with no redesign: every geometry change must be explained in the PR;
- the strings split must keep `strings.ts` re-exporting, so later packages edit only their area module.
- **Review:** a page-layout quick run per folder with no new findings; VC10 spot checks at 320 and 1440.

**B9-11 plan-undo-api.**
- **Done:**
- [PC-01](ui-review-3/plancook.md#pc-01--plan-edits-change-other-meals-silently-show-what-changed-with-review-and-undo-and-hold-what-should-not-move): `Changes` mapped to `[]CellChange`; `runner/snapshot.go` keeps valid cells; `planner/state.go` holds Bought meals; every replanning write returns `changes[]` and `undoToken`; `POST /api/plan/restore` (409 for a stale token); `plan.invalidate` carries `by` and `changes`;
- [SAFE-03](ui-review-3/safe.md#safe-03--cooked-and-not-cooked-cannot-be-taken-back): `MayReopen` and `Reopen`/`ReopenAll` until the end of the household day, with `cooked_takes` (migration 1573) recording takes, Leftover portions, unpinned dependants and Bought rows;
- [SAFE-07](ui-review-3/safe.md#safe-07--regenerate-enter-commits-and-the-run-gives-no-count-and-no-undo): Regenerate returns `{changed, undoToken}`, restored through the same endpoint;
- `plan_state.revision` and `plan_snapshots` (migration 1574);
- every Go test named in the three items.
- **Traps:**
- one restore mechanism: do not build `/regenerate/{token}/undo`;
- `sources.go` and `names.go` are B9-04's and are read-only here;
- Away (B9-24) registers under the same token later, so keep the registry pluggable.
- **Review:** "A Bought meal is not changed by another meal's Swap" and "Restore writes back the Snapshot exactly".

**B9-12 household-today-api.**
- **Done:**
- PC-14: `earliestStart` (default 06:30, "Off" possible), the `tooEarly` filter beside `advanceBlocked` (a Pinned meal is flagged, not refused) and a new unfilled reason in `explain.go`;
- TB-06: `setupHidden` and `POST /api/meal-slots/batch` (everyone attends; an empty name is refused);
- TB-02: one marks-aware Advance Steps source for the next 24 h, used by Today, the board and notifications;
- TB-14: notification URLs per kind ("Start cooking" lands in Cook Mode for that slot);
- RES-08: `/api/me` carries `householdTimeZone`;
- migration 1575.
- **Traps:**
- existing Households get 06:30, so their next replan may move a long Recipe off an early slot; this goes in the upgrade notes;
- do not touch `internal/plan/**`.
- **Review:** the PC-14 and TB-02 Go tests.

### W2

**B9-13 listrow.**
- **Done:**
- `ListRow` gains:
  - `below` (PC-06);
  - `actions` (SET-03: its own line below 35 rem);
  - `info` meta status;
  - `metaLines` (DS-10: two lines on navigation rows);
  - the `sync` prop with `SyncNotice` (RES-03);
  - the row-text size container and the compact Restock meta (SSP-05);
  - row names (A11Y-08);
  - the DS-01 target and lift;
- the DS-05 Leftover row fix;
- `ListGroup` always shows its title visibly (SSP-03);
- the neutral `Avatar` (SET-12);
- `lib/restock.ts` ("Below 4 · 2 in Stock", compact "2 in Stock");
- rules P24 (always fail), P28, P40 and P41 (by mode).
- **Traps:** no feature adoption here. Every slot keeps the current call sites rendering the same.
- **Review:** VC5 and VC6 on `shots/ssp-05-after-*`, `set-03-after-*` and `ds-05-after-*` at 320, 390 and 1440.

**B9-14 sheets.**
- **Done:**
- DS-01: a Menu renders as a portal sheet on a phone, with 44 px targets;
- SHORT-02:
  - `sheetLayout`, with the body keeping `min(6rem, 30dvh)`;
  - on short viewports the panel takes the full height minus 8 px, with no grip and a `title-3` title;
  - the footer flows below 40 %;
  - `FormActions` is one row: one primary, one secondary or outline, and ⋮ (`more`);
  - the destructive slot is the last row under a divider below 600 px;
- SHORT-07: popover sizing;
- `confirmDismiss`;
- 5 px body ring room and `scroll-padding` (R-C, SET-A);
- `context` prop (a muted "Mon 16 Nov · Dinner" line);
- A11Y-07: `useModalDialog` re-checks focus after a remount, plus `focusSuccessor`, `useFocusKeeper` and `focusStepStart`;
- rules P25 and P33 (always fail);
- P18 extended to sheet and dialog bodies.
- **Traps:**
- the primitives only; adopting them in MemberEditor, MealSlotEditor, DateAttendancePanel, WeightRuleEditor and the Plan sheets belongs to those packages;
- keep the old props working until W8.
- **Review:** VC2, VC3 and VC7 on `short-02-after-*` at 844×390 and 390×844, light and dark.

**B9-15 select.**
- **Done:**
- [SET-06](ui-review-3/settings.md#set-06--crafted-select-one-chip-line-two-line-options-homeend-that-show-the-option-focus-ring-not-cut): one chip line, two-line options, Home/End that scroll the option into view, an uncut ring;
- `TimeZoneSelect` and `CurrencySelect` (searchable);
- DS-03: Select `iconOnly` with the value in the accessible name (DS 6), and `useSortFits`;
- SAFE's placeholder;
- RX-09's create row in `OptionList`;
- `useFittingChips` moved and re-exported;
- the P22 revision;
- the scenarios `shop-barcode-sheet` and `planning-recipe-select`.
- **Traps:** `ProductSelect.tsx` is B9-30's in W4.
- **Review:** VC3, VC6 and VC7 at 320, 390, 834 and 1440.

**B9-16 controls.**
- **Done:**
- A11Y-05 option B: a stronger fill plus a 2 px bottom rule on Search and the Segmented track;
- A11Y-06: accent container, accent ring and a check or filled icon on Segmented, ChoiceChip and the pressed IconButton;
- A11Y-09: `IconSet` with an 8 px gap (12 px on a coarse pointer), coarse `::after` targets, and the stepper's − and + at 36 px in the 48 px frame;
- TextArea with no grip that auto-grows from 3 lines;
- SAFE-04: `FieldFrame`, `FormError` and `focusFirstInvalid`;
- SET-07: the error and helper take the field's full track, up to 60 ch;
- `DateField rangeStart`;
- `DurationField` and `lib/time` ("6 h", "1 h 30 min");
- `Disclosure` (a closed summary says what it holds);
- `Stepper lg`;
- check-ui `alert-in-form`;
- P36 (by mode);
- the `household-errors` scenario.
- **Traps:** the Segmented ring goes round the whole track, and the options draw none.
- **Review:** VC3, VC6 and VC7 on `mocks/a11y-05-field-boundaries.html` and `a11y-06-selected-states.html`, light and dark, with all accents.

**B9-17 tiles-tones.**
- **Done:**
- DS-06 tones on Tile and Chip, with `check-ui.allow-tones`;
- `status-tone` (warn now; it fails at B9-55);
- Chip: `as="button"`, max width (DS-04), minimum height, coarse target, selected state;
- `TimerTile md` and `density`;
- `TimerPill` with Pause nested (inner ring, the accent boundary steps back) and a "+N" badge as a 28 px round button;
- `ViewfinderStrip` (SSP-06);
- `MemberPill`.
- **Traps:** feature tone sites are converted by their feature packages: list them in the PR for the main session.
- **Review:** VC6, VC9, and VC3 on the pill.

**B9-18 toast-undo.**
- **Done:**
- SAFE R1–R5:
  - one toast at a time;
  - an Undo toast lasts 8 s and pauses on hover, focus and while the page is hidden; Scan keeps 5 s;
  - `useUndoToast({headline, subline, body})`;
  - `useLeaveGuard` (in-app exits only, no `beforeunload`);
  - a reload and crash draft store with `DraftNotice`;
- `ConfirmDialog` with `groups` and `details` as R-E rows and the outline Cancel focused;
- toast offsets above the bar and the keyboard;
- SSP-12's `hold(rect)`, so a toast never covers a given row;
- check-ui `danger-sheet`;
- P43 (always fail).
- **Review:** VC4 and VC11 on `mocks/safe-00-patterns.html` and the confirm mocks.

### W3

**B9-19 shell-chrome.**
- **Done:**
- SHORT-04: the 64 px compact rail in short landscape, a 52 px icon bar for short narrow, and the bar stepping aside while a text field has focus (SHORT 2);
- SHORT-05: gutters `max(gutter, inset)`;
- SHORT-08 and StickyActionBar: one row, `--bar-gap`, as wide as its column, floating only while it has something to do;
- DS-02 / R-F: icons only below 22.5 em, 40 px squircles inside the bar, the link as the whole track;
- DS-03 PageHeader at 320 (one labelled Button, the rest `iconOnly="narrow"`);
- the A11Y-01 title hooks and the PageHeader `h1` target;
- nav current with a non-colour cue;
- `.your-menu-button` coarse target;
- the RX-03 PageHeader basis;
- rules P31, P35 (always fail) and P32 (by mode);
- the `bottom-bar` scenario at 320, 340, 360 and 430.
- **Traps:**
- `index.html` gets only `viewport-fit=cover` here; boot is B9-49's;
- the bar under 360 must match DS-02, not PC's older variant.
- **Review:** VC6 in close-up crops of the squircles at 320, light and dark; VC10 at 844×390 and 568×320.

**B9-20 res-state.**
- **Done:**
- [RES-02](ui-review-3/res.md#res-02--one-state-model-for-data-screens-unknown-is-not-empty): `dataState` gives one of loading, saved, unknown, empty or error; `LoadState` and `Skeleton`; the listed screens show "unknown", not "Nothing matches", offline;
- RES-06: a 1 s timeout budget, and failed saves name what failed;
- `householdDate` and `meCache`;
- `TileErrorBoundary`;
- the `offline-unknown` scenario;
- the check-ui "500 → error state within 2.5 s" probe.
- **Traps:**
- this package adds new test files and does not edit existing screen tests, which B9-22 may touch;
- Today's adoption is B9-44's.
- **Review:** `shots/res-02-after-*` at 390 and 1440, light and dark.

**B9-21 res-serving.**
- **Done:**
- RES-01: the navigation fallback serves the app shell, not a redirect, and Feeder opens offline;
- RES-04: gzip and brotli, immutable hashed assets, the bundle budget line in `check.sh`;
- RES-10 = A11Y 4: no `skipWaiting` on install; a toast "A new version is ready" with Reload;
- the offline-launch and header probes.
- **Traps:**
- no route splitting (deferred);
- the beta.8 worker still auto-claims once, so the first upgrade reloads without the toast: this goes in the upgrade notes.
- **Review:** VC4 on the update toast.

**B9-22 units.**
- **Done:** [SSP-16](ui-review-3/shopscan.md#ssp-16--big-quantities-in-the-base-unit-digits-ungrouped): kg and l from 1000 g / 1000 ml, digits grouped ("1,250 pieces"), with the Base Unit still stored.
- **Traps:** this package edits only `lib/units.ts` and existing lib-test expectations.
- **Review:** the format table in the chapter.

**B9-23 ticks-api.**
- **Done:**
- SSP-01: tick JSON `{by: hand|scan, added}`; `PATCH /api/shopping/ticks` (0 = Take back, keeping the tick, per ADR 0019); `PATCH /api/shopping/extras/{id}/tick`; the default amount is the last-bought pack, or the Line's need when no pack is known (SSP 1);
- SSP-02: `moreSinceTick(q0, added, q2)` and `more` on the Line;
- RES-03: `shopping_tick_additions` (migration 1576 moves the existing `lot_id`/`lot_quantity` into the first addition; `covers` uses the largest addition, `added` the sum); the `shop_tick` sync op with a `client_uuid`; an offline Tick that syncs after another User's tick always adds its Stock Lot (RES 2);
- the Go tables from both chapters.
- **Traps:**
- the data-moving migration needs a test with existing ticks of both kinds (Line and extra);
- Undo and Take back act per addition.
- **Review:** "Derive: ticked Chicken whose need grows by 750 g" and the migration test.

**B9-24 away-api.**
- **Done:**
- [PC-08](ui-review-3/plancook.md#pc-08--whos-eating-on-the-day-tile-and-an-away-record-for-a-member-who-is-away-for-days) backend: `internal/away` (domain only: `Validate`, `Covers`, `Apply`, `End`, `Summarise`), its store and thin handlers (`?dryRun=1`; DELETE refused with 409 `away_started`);
- `despiteAway` on the slot-date read and the attendance PUT;
- `GET /api/plan` carries `away`;
- before-state registered under the PC-01 `undoToken`;
- migration 1577;
- a range may run past the Planning Horizon or have no end.
- **Review:** the Go tests in PC-08.

### W4

**B9-25 timers-shell.**
- **Done:** [PC-04](ui-review-3/plancook.md#pc-04--timers-outside-cook-mode-a-shell-timer-pill-an-in-app-finish-alert-resume-at-the-last-step): the shell pill on every page, an in-app finish alert, and resume at the last Step.
- **Traps:** in this wave `AppShell.tsx` is only for the pill mount.
- **Review:** VC3 (nested Pause), VC4 (finish alert), VC6 (the "+N" circle).

**B9-26 plan-undo-ui.**
- **Done:**
- the "What changed" toast (headline, subline, Review and Undo, no icon) and `ReplanReviewSheet` grouped by day with a "was" line;
- live updates from another User;
- Not cooked and Cooked Undo from the toast and from the Planned Meal sheet ("Undo Cooked") until the end of the household day;
- Regenerate: Enter does not commit; the outline Cancel is focused; a count and Undo;
- the scenarios `plan-after-swap` (390 and 1440) and `regenerate`;
- every BDD scenario in PC-01, SAFE-03 and SAFE-07.
- **Traps:**
- `PlanCourseRow.tsx` gets only `data-changed`; the rest is B9-32's;
- `PlannedMealSheet.tsx` gets only the Undo Cooked secondary; the layout is B9-38's;
- the To confirm hooks in `features/today` are this package's in W4.
- **Review:** VC4 and VC5 on `shots/pc-01-after-*` and `safe-03-after-*`, light and dark, at 390 and 1440.

**B9-27 recipe-detail.**
- **Done:**
- RX-04: a Cook tile under the hero from 1024 px, the sticky bar below (RX 2), the hero aligned;
- RX-05: description, Source and Attribution;
- RX-06: Yield with its unit;
- RX-07: untimed Steps are not "No Steps" (with `stepCount`);
- RX-13: metric tiles on surface; the Ready Meal chip on the chip line;
- RX-14: line ⋮ at the row's end;
- SAFE-05: Delete of a planned Recipe says why it can't be deleted before asking (`deletable`);
- SHORT-04: "Cook" below 360, named "Start Cook Mode";
- A11Y 3: an "Exclusions" tile with a summary and a per-Member note;
- Ingredient and Step rows as R-E rows.
- **Step rule:** the Step text is at body weight 500, never 600 or bold. Only short keys are `body-strong`. This overrides recipes.md's "weight 600".
- **Traps:**
- the line ⋮ and drag handle take the outer ring (A11Y-02, not RX's inner ring);
- the metric value "37 min" uses `nowrap`.
- **Review:** VC5, VC8 and VC3 at 320, 390, 1024 and 1440, light and dark.

**B9-28 import-export.**
- **Done:**
- RX-01: Import Review lists the Recipes it imports (state "New", "Replaces yours", "Kept as …", "Skipped", or "Choose" in info until answered); open questions are reachable; the result names the Recipes (rows "Created" and "Replaced", "Ingredients created 3"). The review is read-only, with Edit afterwards (RX 3);
- RX-11: two paths;
- RX-12: matches as rows with their answer;
- RX-15: Export gives a next step.
- **Step rule:** in the preview, Step text is body weight 500.
- **Traps:**
- `features/import/**` is serialised (§3.7 of ui-review-2);
- "Next question" is icon-only below 600 px but keeps its name.
- **Review:** VC5, VC7 and VC8.

**B9-29 pantry.**
- **Done:**
- SSP-03: Storage Place headings, visible;
- SSP-05: status first, never cut; Restock said one way (SSP 4);
- SSP-10: Put away a whole shop;
- SSP-17: Keep sets "Good until today", and Change offers other dates (SSP 8);
- SAFE-09: Throw out with Undo, and the streak comes back;
- SAFE-11: Add Lot starts with no arbitrary Ingredient; the Lot sheet shows Move only when there is somewhere to move to;
- DS-03: the FilterBar fits 320 (the Sort chip icon-only with its value in the name);
- the SHORT-07 rule;
- TB-11's `lot` parameter;
- scenarios `pantry-put-away`, the P23 widening on Supplies, and the text-spacing Sort scenario.
- **Traps:**
- `ShortfallNotice` and `StockCorrectionSheet` are B9-45's;
- pantry-filter.md §3 "one line" stands.
- **Review:** VC5, VC6 and VC7 at 320, 390 and 1440.

**B9-30 shops-products.**
- **Done:**
- SET-01: the Add Shop Barcode sheet on the crafted Select, with no sideways scroll;
- SET-02: Price rows with a value column, read by Shop;
- SET-04: page order, history, Save beside its field, removable barcode chips, the check digit (SET 1);
- SET-13: the narrow column with cards two-up (SET 2), and pairs only;
- SET-14a: "New Product" on the list (SET 4);
- SET-14b: Shop row meta;
- SAFE-02: Delete Shop as a confirm with counts as rows; Archive with Undo; light removals with Undo;
- SAFE-04 errors at the field;
- SHORT-02 in WeightRuleEditor;
- `ImagePicker compact`.
- **Review:** VC1, VC5 and VC11 on the confirms, VC6 on the barcode chips.

### W5

**B9-31 editor-safety.**
- **Done:**
- SAFE-01 option B: "Leave without saving?" (Keep editing / Discard changes) on every in-app exit, and a draft kept only across a reload or a crash, with a conflict notice;
- SAFE-06: Cancel never leaves the app on a deep link;
- SAFE-10: removing a Step, line or ingredient use offers Undo;
- SAFE-04: Recipe errors at the field, with focus to the first invalid one;
- check-ui `no-history-back`.
- **Traps:** the editor layout is B9-37's, so this package touches no `recipe-editor.css` layout.
- **Review:** VC4 and VC11 on `safe-01-*` and `safe-10-*`.

**B9-32 plan-grid.**
- **Done:**
- PC-06: why chips on their own line under the row's text and icon set, shown whole or counted in "+N";
- PC-07: Couldn't plan as one compact tile; unfilled Course rows; "Mark Recipes for Dessert" staying on the Plan (`POST /api/courses/{id}/recipes`);
- PC-11 option B: `min="day"` auto-fill (at most 4 columns), with the days of an incomplete last row sharing it;
- PC-16 6 and 9;
- PC-14's cause and warn chip;
- A11Y-08: names such as "Swap Lunch, Sun 15" and Pin as one toggle;
- IconSet on rows;
- Plan tones (warn, info);
- P38;
- scenarios at 390, 820, 1440 and 1920.
- **Traps:** `lib/days.ts` daySpans is this package's in W5; B9-39 adds hero helpers in W6.
- **Review:** VC6 (no cut chips), VC3 (IconSet rings stop 3 px short) and VC9 against `mocks/pc-11-grid-b.html` at 820, 1440 and 1920.

**B9-33 recipes-list.**
- **Done:** RX-03 compact card on phones (RX 1) with New Recipe on the title row; RX-07 tile line; RX-15 no-result with a next step; A11Y-11 tiles are links.
- **Traps:** at 320, chips that do not fit are left out, never cut to one letter.
- **Review:** VC6 at 320, 390 and 1440, light and dark.

**B9-34 shop-ticking.**
- **Done:**
- SSP-01: one tap ticks, with an Undo · Change toast (SSP 2). The ticked row says what reached Stock. The 44 px tick target is the only thing that ticks.
- SSP-02: "More since your tick" in To get.
- SSP-18: a ticked Line's sheet has actions.
- SSP-05: the Shop part.
- SAFE-09 and SAFE-11 for the Shop.
- A11Y-07: focus moves to the next row after Tick or Not needed.
- The check-ui focus-after-row scenario.
- The `shop-ticked` scenario (P23 on ticked rows at 360, 390 and 1120).
- **Review:** VC4 (one toast with Undo and Change, no icon), VC6 and VC3 (the tick circle takes the ring).

**B9-35 scan-camera.**
- **Done:**
- SSP-06: typed entry first when there is no camera, and the tablet split;
- SSP-12: the keypad scrolls the row above the sheet, and a toast never covers `[data-pricing]` (P43);
- Scan in landscape with the rail, where Mute and torch get the R-A surface;
- the `scan-typed` scenario (P12; P30 extended to `[data-one-line]` buttons at 820 and 1024).
- **Traps:** keypad keys are siblings 8 px apart, so they take the outer ring (A11Y-02).
- **Review:** VC1, VC3 and VC7.

**B9-36 household-members.**
- **Done:**
- SAFE-02 Remove Member: a confirm with rows of what goes, then an Undo toast (SAFE 4); the footer's destructive slot;
- SAFE-04: Member sheet errors;
- SAFE-08 option B: Your preferences with an explicit Save, a live whole-app preview and a "Discard changes?" guard (sign-out included);
- SET-07: the Household form with the new Selects;
- SHORT-02 in MemberEditor (the circular Close stays, since there is no Cancel);
- the `preferences-preview` scenario (sticky bar only while dirty, within the P32 budget).
- **Review:** VC2, VC5 and VC11 on `safe-02-*member*`, `safe-08-*` and `set-07-*`.

### W6

**B9-37 editor-flow.**
- **Done:**
- RX-02:
  - "Description and source" and "Planning" collapsed for new and saved Recipes (RX 5);
  - Recipe kind as one Segmented control, with Whole meal staying a Switch (RX 4);
  - Tags as removable chips plus "Add Tag" (RX 6);
  - focus to Quantity after a pick;
- RX-08: durations in min, h or d;
- RX-09: the Tag chooser opens clear of the sticky bar (P12 extended);
- RX-10: a visible Optional control;
- SHORT-08: the editor strip.
- **Traps:**
- a removable chip is one button with an outer ring;
- the Step drag handle takes the outer ring;
- the remove button must not overhang the chip.
- **Review:** VC3, VC6 and VC7 on `rx-02-after-*`, including the new focus renders.

**B9-38 plan-sheets.**
- **Done:**
- PC-09: a context header; one primary and one secondary (Undo Cooked on a Cooked meal); Open Recipe; Leftovers on a Cooked meal;
- PC-10: the day, Meal Slot and Course named; real chips; no ISO dates;
- PC-16 8: the neutral monogram;
- RX-08 "6 h" in Choose a Recipe;
- SHORT-02 in these sheets: FormActions with `more`, Mark as Cooked not wrapping at 390.
- **Review:** VC2 (no Close where Cancel exists), VC7 and VC10 at 844×390.

**B9-39 today-hero.**
- **Done:**
- TB-01: the hero moves on at the slot time, and the past meal goes to the top of To confirm (TB 2);
- TB-10: why chips are buttons that open the Planned Meal sheet;
- TB-15b: the eyebrow never breaks inside "START / 08:00";
- the `today-after-lunch` scenario.
- **Traps:** `plan.css` belongs to B9-38 in W6, so the hero styles go in `TonightHero.css`.
- **Review:** VC3 (the ring in `currentColor` on the hero), in both schemes.

**B9-40 cook-step.**
- **Done:**
- PC-03: capped photo, long-Step size, a timer strip, a rail from 1024 px, 44 px controls, safe Cancel;
- `--text-step-weight` (500);
- PC-12: no Cooked before the date, so the last Step is not a dead end;
- PC-15: Reheat buttons;
- PC-16 1–4;
- SHORT-01:
  - Back and Next as side columns in short landscape;
  - tap zones at every width (SHORT 3);
  - no chevrons in landscape;
  - only whole pills in the strip, two from 700 px;
- Advance Steps tiles in info;
- the Cook title;
- P34 (always fail).
- **Review:** VC8 above all (Step text large at 500), then VC3 on the nested Pause and VC6 on "+N", at 390, 844×390, 1024 and 1440, light and dark.

**B9-41 scan-data.**
- **Done:**
- SSP-07: the weight and price per kg on weighed rows;
- SSP-11: manual extras in To get;
- SSP-15: a weight-style code with no Weight Barcode Rule gets a hint;
- SSP-20: no 14-digit display;
- SAFE-09: Stock-take Undo;
- A11Y-07: step focus in the new-Product sheet;
- the `scanWeighed` scenario.
- **Review:** VC4 and VC5.

**B9-42 meal-slots.**
- **Done:**
- SAFE-02: "Remove Dinner on Monday?" with Goes and Stays rows, then the toast and Undo; the restore conflict message;
- SET-08: cards and the week strip from 320;
- SET-09: one Course-row anatomy (↑ ↓ × take the outer ring);
- SET-10: long Member names;
- SET-14h: Edit from "Every day" starts with all days (SET 5);
- SET-15: the removed Meal Slots section;
- SHORT-02: the Edit Meal Slot footer as ⋮ plus Save Meal Slot;
- A11Y-07: no remount in Change a date;
- the `meal-slot-editor` scenario.
- **Review:** VC5, VC11 and VC3.

### W7

**B9-43 shop-line-sheet.**
- **Done:**
- SSP-13: an estimate from a known Price before a first purchase, and Price entry from a Line (`ui/PriceSheet`);
- SSP-14: the sheet lists the Planned Meals and offers "Get something else…" (no new Line state, SSP 6);
- SSP-04: the notice never cuts its verb;
- SSP-09: "Shopping List complete" as a success status tile with one primary (Put away).
- **Review:** VC1, VC5 and VC7.

**B9-44 today-grid.**
- **Done:**
- TB-03 option B: from 60 rem the hero and To confirm span two of three tracks with an aside (TB 1);
- TB-02: Advance Steps due in 24 h, with Done (outer ring), in info;
- TB-08 and TB-09: one vocabulary and one `TileHeader`;
- TB-11: Use soon and Leftovers lead somewhere;
- TB-12: a "Shopping at <Shop>" tile with Back to Scan (TB 5);
- TB-03: the streak hidden at 0 (TB 3);
- RES-05: household date and reserved tiles, with CLS ≤ 0.1;
- RES-09: tile boundaries;
- Today's single `ShortfallNotice` under To confirm (after B9-45);
- P42;
- the scenarios `today-advance` and `today-after-lunch` (Today parts).
- **Review:** VC1, VC3 and VC9 at 390, 820, 1024, 1440 and 1920.

**B9-45 cook-after.**
- **Done:**
- PC-02: a friendly Cooked moment; one `ShortfallNotice` taking a list; one Correct Stock sheet; return to where you started (`state.from`); no duplicate toast;
- PC-05: a "Get ready" tile with the Ingredients scaled to the planned portions (PC 6);
- PC-13: Freeze keeps no stranded portion, and Leftovers of one Recipe with the same Use-by show as one row (PC 7); meta order "Use by Tue · 1.25 portions" (DS 5).
- **Review:** VC4, VC5 and VC9 (one notice, not danger tiles per Ingredient).

**B9-46 away-ui.**
- **Done:**
- PC-08: the Away sheet (a date range that may pass the Planning Horizon or stay open), the day tile's Who's eating line, "despite Away" in Who's eating, the toast with Review and Undo;
- SET-16: Away on the Members list and in the Member sheet;
- the BDD scenarios in PC-08 and SET-16.
- **Review:** VC5, VC6 and VC4 against `mocks/pc-08-*.html` at 390 and 1440, light and dark.

**B9-47 board.**
- **Done:**
- TB-04: a visible Close that dims after 10 s;
- TB-07: wall-scale type tokens, Tomorrow uncut, Done and chips sized for the wall, portrait; Next Advance Step **always info**;
- TB-08: board vocabulary; TB 7: the same eyebrow as Today;
- TB-15c/d: the error state and a hidden `h1`;
- SHORT-03: the wall grid by height, with a 560 px minimum;
- RES-09: tile boundaries.
- **Review:** VC6 and VC9 at 1180×820, 1920×1080, 2560×1440, 844×390 and 820×1180 portrait, dark first.

**B9-48 ingredients.**
- **Done:**
- SET-05: one "Keeping" tile, Rename in a sheet, no orphan tile, one Stepper;
- SET-14e: the empty search offers New Ingredient;
- SAFE-02: Delete Ingredient or Supply as a confirm; light removals with Undo;
- SAFE-04: Unit Conversion errors at the field.
- **Review:** VC5, VC6 and VC11.

### W8

**B9-49 shell-boot.**
- **Done:**
- A11Y-01: `document.title` is "<h1> · Feeder", and focus goes to the `h1` on route change (P37, always fail);
- A11Y-10: the skip link;
- A11Y-12: `<nav aria-label="Main">`, and Your menu named;
- RES-07: a sticky offline banner in the gutter, beside the rail, in household time, with safe insets;
- RES-08: the User's theme before first paint, and a shell skeleton;
- RES-09: the page boundary with a Try again that works;
- TB-13: the current nav item on sub-pages;
- TB-14: landings per notification;
- TB-15a and c;
- SET-14g: the iPhone Safari notification copy.
- **Review:** VC1, VC4 and VC3 on the skip link at 390 and 1280.

**B9-50 receipt.**
- **Done:**
- SSP-08: Add… with receipt context, matches first, a truthful Accept all, no duplicate Product (`productId` on adds);
- SSP-19: the first action is the big one;
- the receipt row's IconSet.
- **Review:** VC1, VC5 and VC7.

**B9-51 settings-small.**
- **Done:**
- SET-11: Tags rows;
- SET-14c: Courses meta;
- SET-14d: rule wording "Recipe" and "Tag";
- SET-14f: the Model field;
- SHORT-06: the Assistant's sticky bar only while dirty;
- PC-14: the "Earliest start" time field in Planning rules, with Off;
- SAFE-04 and SAFE-02: rule forms with errors at the field and light removals with Undo;
- DS-10: two-line hub descriptions (P28).
- **Review:** VC1, VC7 and VC4.

**B9-52 allowlist-access.**
- **Done:**
- SET-03: the email stays readable, the actions slot, "Copy sign-in message", and Share where the device has a share sheet (SET 3);
- SET-12: a neutral monogram, no nested tile, readable at 320;
- TB-15e: the access badge is not announced twice;
- `word-break` gains `overflow-wrap: anywhere`;
- P40 on these routes at 320 and 360.
- **Review:** VC6 and VC7 at 320.

**B9-53 first-run.**
- **Done:**
- TB-06: five steps that open the action;
- time zone and currency proposed from the browser and confirmed;
- the Recipes step completes at 5;
- the checklist stays until done or hidden (TB 6), with "Setup checklist · Show on Today" in Household;
- the `MealSlotQuickStartSheet`;
- focus and announcements as specified.
- **Traps:** an existing Household whose steps are done must **not** see the checklist again after the upgrade: test it with a seeded beta.8 database.
- **Review:** VC5 and VC6 against `mocks/tb-06-step*.html`.

### W9

**B9-54 offline-shop.**
- **Done:**
- RES-03 UI: queued Ticks (RES 1) with pending and failed rows (`SyncNotice`);
- the Line sheet's additions list with Take back per addition;
- "both bought it" wording (RES 2);
- the shell's pending count;
- the check-ui offline tick scenario;
- every BDD scenario in RES-03.
- **Review:** VC4 and VC5 on `mocks/res-03-*.html`.

**B9-55 a11y-finish.**
- **Done:**
- A11Y-04: the forced-colours layer (outlines in `Highlight`, borders in `ButtonText` and `CanvasText`, the 2 px rule on Search and Segmented);
- the W2/W3 barrel exports in `ui/index.ts`;
- every check-ui rule 13–26 failing on every folder (`no-first-choice-default` may stay warn with a reason);
- every route in `check-page-layout.modes` failing;
- P27, P28, P32, P36, P38 and P40–P42 moved to `ALWAYS_FAIL`, or failing on every route;
- `check-ui.allow-tones` limited to justified sites.
- **Review:** `mocks/a11y-04-forced-*.html` under emulated forced colours; a full-profile run with zero findings.

### W10

B9-56 and B9-57 are in sections 8 and 10.

## 7. Migrations and the pre-1570 snapshot

Beta.9 has one migration family and one snapshot, in the b5–b8 pattern ([b8-snap.md](../dev/design/b8-snap.md)).

| # | File | Package | What it does | Kind |
|---|---|---|---|---|
| 1570 | `1570_meal_slot_removed.sql` | B9-04 | Rebuilds `meal_slots` with `removed_at TEXT`; `UNIQUE (weekday, name)` becomes the partial index `meal_slots_active_name … WHERE removed_at IS NULL`; adds `meal_slot_removals` | parent-table rebuild, `foreign_keys=OFF`, `foreign_key_check` before commit |
| 1571 | `1571_member_removals.sql` | B9-04 | The Remove Member snapshot for Undo | additive |
| 1572 | `1572_stock_undo.sql` | B9-05 | `lot_json` on the waste record; the Scan ledger's Stock-take record for Undo | additive |
| 1573 | `1573_cooked_takes.sql` | B9-11 | `cooked_takes` (with `lot_json`), Leftover portions, unpinned dependants and Bought rows for Undo Cooked | additive |
| 1574 | `1574_plan_snapshots.sql` | B9-11 | `plan_state.revision`, `plan_snapshots` (the `undoToken` store for every replanning write and Regenerate) | additive |
| 1575 | `1575_household_b9.sql` | B9-12 | `earliest_start` (existing Households `'06:30'`), `setup_hidden` | additive |
| 1576 | `1576_shopping_tick_additions.sql` | B9-23 | `shopping_tick_additions(range_to, ingredient_id/extra_id, lot_id, quantity, covers, user_id, client_uuid UNIQUE, ticked_at, synced_at)`; moves `shopping_ticks.lot_id`/`lot_quantity` and the extras' tick Lot into the first addition | additive plus a data move |
| 1577 | `1577_member_away.sql` | B9-24 | `member_away`, `attendance_override_attendees.despite_away` | additive |

**Snapshot wiring (B9-04, W0):**
- `backup.PreSnapshot1570File = "feeder-pre-1570.db"`
- `db.Pre1570Prefixes = []string{"1570_", "1571_", "1572_", "1573_", "1574_", "1575_", "1576_", "1577_"}`
- `db.NeedsPre1570Snapshot`
- a sixth `preSnapshots` row after 1560 with `keep: true`

**Rules:**
- The snapshot triggers when the database has applied migrations and any listed prefix is pending.
- It is taken before any migration runs, verified, written with mode 0600 and never replaced. A failure stops start-up and migrates nothing.
- List and Prune ignore it.
- Every package that adds a 157x file adds only that file. No other 15NN number may be added in beta.9 without the main session changing this table.

**Tests:**
- `internal/db/pending1570_test.go`: prefixes, no overlap, the trigger on a new file, on beta.8, beta.7 and beta.4.2 upgrades and with everything applied, and `NeedsPre1570Snapshot` against the embedded set;
- `internal/backup/snapshot_named_1570_test.go`;
- `cmd/feeder/startup_pre1570_test.go`:
- beta.8 upgrade;
- fresh install;
- an existing file is kept;
- a failure migrates nothing;
- skipping beta.8 (a beta.7 database gets `feeder-pre-1560.db` and `feeder-pre-1570.db`, both the beta.7 database);
- all six from before Courses;
- `scripts/test/b9-snap_test.sh`;
- `scripts/test/b5-snap_test.sh` accepts `1570_`…`1577_` only if `Pre1570Prefixes` lists them.

Each migration package also adds its own migration test:
- 1570: every row is copied and `foreign_key_check` is empty;
- 1576: existing Line and extra ticks become one addition each, with the same Lot and quantity;
- 1575: the default for an existing row.

**Upgrade notes for deploy.md** ("Upgrading from 1.0.0-beta.8 to 1.0.0-beta.9", written by B9-57 in the beta.8 section's style):
1. Take a backup.
2. Upgrade: `helm upgrade … --version 1.0.0-beta.9 --reset-then-reuse-values`, or pull and restart. There are no new settings.
3. Eight migrations run, one line each (the table above, in user words).
4. The pre-1570 snapshot `feeder-pre-1570.db`. A beta.7 database also gets `feeder-pre-1560.db`, and both are the beta.7 database.
5. **Behaviour after the upgrade:**
 - "Earliest start" is 06:30 for every Household, so the next replan may move a long Recipe away from an early Meal Slot (set it to Off in Settings > Planning rules to keep the old behaviour);
 - Meal Slots removed before the upgrade are gone; from now on a removal keeps Cooked history;
 - the first load after the upgrade reloads once on its own (the beta.8 service worker); later versions show a "new version" toast with Reload;
 - responses are now compressed, so a reverse proxy must pass `Content-Encoding` through;
 - existing hand ticks keep their Stock Lot as their first addition.
6. Rolling back: stop Feeder, restore `feeder-pre-1570.db` as `feeder.db` (uid/gid 65532, remove the `-wal` and `-shm` files), and run `1.0.0-beta.8`. Everything recorded after the upgrade is lost.

## 8. Docs and ADRs (B9-56, W10)

Code packages put their ADR notes and spec deltas in their PR description. B9-56 writes the files against the merged code. GLOSSARY and spec wording are checked by `scripts/changelog-avoid.py` and `go test ./docs/spec/...`.

### ADRs

| # | Title | Decision | Source package |
|---|---|---|---|
| 0020 | Undo of Cooked and Not cooked until the end of the household day | Cooked and Not cooked can be taken back, from the toast and from the Planned Meal sheet, until the household day ends. The server records what the action took (`cooked_takes`: Stock Lots, Leftover portions, unpinned dependants, Bought rows) and gives it back with `stock.GiveBack`. Stock already gone is reported, not invented. Rejected: a toast-only Undo (decision SAFE 2 A). | B9-11, B9-26 |
| 0021 | A removed Meal Slot keeps its history | Removing a Meal Slot sets `removed_at` and keeps Cooked and Not cooked Planned Meals, Slot Rules, Attendance and Courses. Unresolved Planned Meals go, and a restore within 10 minutes brings back To confirm rows. A partial unique index lets the name be reused. Rejected: a history table (every reader would change), and blocking removal (SAFE 7). | B9-04 |
| 0022 | A Plan edit replans only what it breaks, and says what changed | Every replanning write (Swap, Choose, Pin/Unpin, Who's eating, slot date, Away, Regenerate) returns `changes[]` and an `undoToken`. A valid later meal is kept, and a Bought meal never moves as a side effect. One restore (`POST /api/plan/restore`) puts back the before-Snapshot while nothing else has written since. Rejected: a "keep the next days" setting (PC 1), and replanning again as Undo. | B9-11 |
| 0023 | A Tick covers an amount | A tick records the Line quantity it covered (Q0). When the need later grows past what the tick left uncovered, the difference reappears in To get as "More since your tick", while the ticked row stays ticked. Amends spec §9's per-Ingredient tick. Rejected: untick on growth, or a hint only (SSP 3). | B9-23 |
| 0024 | A Line can be ticked more than once; each Tick by hand keeps its own Stock Lot | Hand ticks are additions with their own Lot, quantity, `covers` and `client_uuid`. Undo and Take back act per addition, and untick acts on all of them. Offline ticks are queued like Scans (RES 1) and always add their Lot when they sync after another User's tick (RES 2). Amends ADR 0019. | B9-23, B9-54 |
| 0025 | Away is kept on the Member and subtracted from Attendance | Away is a dated record on the Member (it may run past the Planning Horizon or stay open), applied when the planner reads Attendance. "Despite Away" overrides it for one Meal Slot on one date. Rejected: a bulk Attendance sheet (PC 3). | B9-24, B9-46 |
| 0026 | Today composes its own grid by container width | Today lays out its Bento itself (hero and To confirm across two of three tracks with an aside from 60 rem) instead of through a shared grid primitive. Amends ADR 0016's consequences. | B9-44 |
| 0027 | Sizes follow the browser's text size | Breakpoints are in em (min-width only, one table in `ui/lib/breakpoints.ts`), and type tokens are in rem, so a larger browser text size reflows the layout instead of overflowing it. Guarded by `media-width`, P26 and P27 (DS 2). | B9-02, B9-07 |

### system.md section map

| § | Section | Source | Text from |
|---|---|---|---|
| 1 | Type: roles | amended | DS-07 blocks; board roles table (TB-07); "a field's size token limits its control, never its label, helper or error" (SET-07); **Step text 500, never bold; display text read at length is not extra-bold** |
| 2 | Colour roles | amended | DS-06 tones (warn for a decision, info for a question or a time, Advance Steps info); R-A surface on tints |
| 3 | List rows | amended | R-E; DetailList for read-only rows, ListRow for actionable rows; the value column (TB-11); a grouped list always shows its ListGroup title (SSP-03); the `actions` slot (SET-03); focus successor (A11Y-07) |
| 4 | Grid | amended | PC-11 option B text; TB 1 sentence; "half-width tiles only in pairs" (SET-04); compact media cards (RX-03) |
| 5 | Actions (renamed) | amended | R-A, R-B, R-D, R-D+; ActionGroup; IconSet |
| 6 | Chips and Segmented | amended | the chip line rule (PC-06); Segmented one line; Sort chip icon-only with its value in its name (DS 6) |
| 7 | Pictures | amended | neutral monogram |
| 8 | Spacing and the nav | amended | R-F; long forms use Disclosure (RX-02); a detail page's primary is in the first viewport from 1280×800 (RX-04) |
| 9 | The To confirm pattern | amended | the past meal goes to the top at the slot time (TB 2) |
| 10 | Enforcement | amended | check-ui 13–26, P24–P43 (section 9) |
| 11 | Breakpoints and responsive rules | **new** | DS-09 table |
| 12 | Short viewports and fixed chrome | **new** | short.md's "§11" text, renumbered to 12.1–12.6; guard numbers P32–P35 |
| 13 | Overlays | **new** | ds.md's "§12 Overlays" (sheet room, Menu as sheet) |
| 14 | Safe editing | **new** | safe.md's "§12" rules R1–R5 as §14.1–§14.5 |
| 15 | Focus and targets | **new** | A11Y-02 (R-C, R-C+), A11Y-07, A11Y-09 |
| 16 | Loading, empty, offline and error | **new** | RES-02 rules |

### Spec amendments (`docs/spec/functional-spec.md`)

| Section | Decisions and items |
|---|---|
| §3 Household setup | PC 3 (Away), PC 5 (Earliest start), TB 6 and TB-06 (time zone "proposed from the browser on the first-run checklist and confirmed by the Admin"), SAFE 4 (Remove Member and Undo), SAFE 7 (removed Meal Slot) |
| §4 Recipes | RX 4, RX 5, RX 6, SAFE 1 (Leave without saving) |
| §5 Ingredients, Products, Shops | SET 1 (barcode check digit), SET 4 (New Product), SSP 5 (Price before a first purchase) |
| §6 Stock | SSP 8 (Keep sets "Good until today"), SAFE-09 (Throw out Undo) |
| §7.2 Algorithm and §7.3 Swap | PC 1 (replan only what breaks, Bought never moves, What changed and Undo), PC 5 (earliest start filter), SAFE 3 (Regenerate Undo) |
| §8 Cooked and Leftovers | SAFE 2 (Undo until the end of the household day), PC 4 (not before its date), PC 7 (one row), PC-13 defaults |
| §9 Shopping List | SSP 1, SSP 2, SSP 3, SSP 5, SSP 6, SSP 7 (display: kg and l from 1000, Base Unit stored), RES 2 |
| §10.1 Shop mode, §10.3 Offline | SSP-02 (To get), RES 1, RES 2 |
| §11 Cook Mode and the board | SHORT 3 (tap zones at every width), PC 6 (Get ready), TB 4, TB 7 |
| §12 Notifications | TB 8, TB-14 landings |
| §13 Import and export | RX 3 (read-only review) |
| §14 Theming and layout | DS 1, DS 2, TB 1, PC 2, RX 1, RX 2, SHORT 1, SHORT 2, SAFE 6 |

**Other docs:**
- `ux-brief.md`: the Scan session line (TB 5);
- `shop-scan-proposals.md` §13.11 note (SSP-01);
- `pantry-filter.md` §3 unchanged (DS 6).

**GLOSSARY:**
- new: **Away** and **Earliest start**;
- changed:
- **Tick**: covers an amount; a Line may be ticked more than once; additions;
- **Throw out / Keep**: "Good until today";
- **Base Unit**: display note;
- **Storage Place**: the Pantry heading;
- **Meal Slot**: removed Meal Slots keep history;
- **Cooked**: Undo Cooked;
- **Restock level**: the one wording.

## 9. Guard and test infrastructure

### Page-layout rules (final)

P1–P23 are unchanged. The revisions are:
- P12, extended to the Tag chooser by B9-37;
- P18, extended to sheet and dialog bodies by B9-14;
- P22, revised by B9-15;
- P23, widened by B9-34 and B9-29;
- P30, extended to `[data-one-line]` buttons by B9-35.

| Rule | Checks | Added by | Mode |
|---|---|---|---|
| P24 | A row's title paints over its meta (DS-05) | B9-13 | always fail |
| P25 | A target under 44 px in an open sheet, two overlapping targets, or touching bottom-bar labels (DS-01, DS-02) | B9-14 | always fail |
| P26 | A BentoGrid loses a column as the window widens (resize walk) (DS-09) | B9-07 | always fail |
| P27 | At a 24 px text size: off-role text, or a heading larger than the page title (DS-07, DS-08) | B9-02 | by mode → always fail at B9-55 |
| P28 | A two-line navigation description is cut (DS-10) | B9-13 | by mode → B9-55 |
| P29 | An action in a tile, toast, sheet footer, dialog or banner whose boundary is under 3:1 (R-A) | B9-01 | always fail |
| P30 | A Segmented option on two lines (and `[data-one-line]` buttons) | B9-01 | always fail |
| P31 | A bottom-bar squircle that is not square, or not 6 px inside the bar (R-F) | B9-19 | always fail |
| P32 | Fixed and sticky chrome covers more than 35 % of the viewport height at load (SHORT; was "P17") | B9-19 | by mode → B9-55 |
| P33 | A sheet body under `min(96px, 30 % of innerHeight)`, or a footer visible while the first required control is clipped (SHORT-02; was "P18") | B9-14 | always fail |
| P34 | Cook Step text not visible outside the Back/Next tiles at load (SHORT-01; was "P19") | B9-40 | always fail |
| P35 | Content inside a safe-area inset (SHORT-05; was "P20") | B9-19 | always fail (inset scenario) |
| P36 | A target under 44 px on touch profiles (A11Y-09; was "P17") | B9-16 | by mode → B9-55 |
| P37 | `document.title` is "Feeder", or does not match the `h1` (A11Y-01; was "P18") | B9-49 | always fail |
| P38 | Two visible buttons in `main` share a name (A11Y-08; was "P19") | B9-32 | by mode → B9-55 |
| P39 | A focused control's ring box is clipped, or touches a neighbour or a sticky bar (A11Y-02; was "P20") | B9-07 | always fail |
| P40 | A `.list-row__title` or a field error narrower than 120 px (SET; was "P29"/"P31") | B9-13 | by mode → B9-55 |
| P41 | A grouped list without a visible ListGroup title (SSP-03) | B9-13 | by mode → B9-55 |
| P42 | A `.page-header__subtitle` other than the household date on Today (RES-05) | B9-44 | by mode → B9-55 |
| P43 | A toast covers the row being acted on (`[data-pricing]`, the focused row) (SSP-12) | B9-18 | always fail |

**Profiles and viewports (B9-03):**
- quick: 320×568, 390×844, 834×1194, 1024×1366, 1440×900, 1920×1080;
- full: 320×568, 390×844, 430×932, 844×390, 820×1180, 1180×820, 1440×900, 1920×1080;
- scenario-only: 568×320, 320×256 (400 % zoom) and the 844×390 inset override.

**Scenarios added by their packages:**
- `plan-after-swap`, `regenerate` (B9-26);
- `leftover-menu-sheet` (B9-14);
- `bottom-bar` (B9-19);
- `shop-ticked` (B9-34);
- `scan-typed` (B9-35);
- `scanWeighed` (B9-41);
- `pantry-put-away` (B9-29);
- `scan-price-keypad` (B9-35);
- `shop-barcode-sheet`, `planning-recipe-select` (B9-15);
- `household-errors` (B9-16);
- `meal-slot-editor` (B9-42);
- `preferences-preview` (B9-36);
- `offline-unknown` (B9-20);
- `today-after-lunch` (B9-39), `today-advance` (B9-44);
- `text-spacing` (B9-29, B9-51), `font-24` (B9-02).

**Seed changes**, each in its own `page-layout-seed/<area>.mjs`:
- a Dessert Course on every Dinner, and fixture Recipe 16 (long Step, photo, Advance Step, two Passive timers): B9-26;
- an Away record (B9-46);
- a removed Meal Slot with Cooked history (B9-42);
- hand, scan and "more since" ticks (B9-34);
- a weighed Product (B9-41);
- a pending sign-in request created through the store (B9-52);
- an empty Household (B9-53).

### check-ui rules (final)

Rules 1–12 exist. The new rules:

| # | Rule | What it fails | Added by | Mode |
|---|---|---|---|---|
| 13 | `button-variant` | `variant="tertiary"`, `"danger-tertiary"`, `"accent-secondary"` | B9-01 | fail |
| 14 | `close-button` | `<IconButton icon="close">` outside `CloseButton`, `Toast`, `Chip` | B9-01 | fail |
| 15 | `sheet-cancel` | A sheet or dialog passing its own `uiStrings.cancel` button instead of `onCancel` | B9-01 | fail |
| 16 | `bullet-notice` | A hand-written `ul`/`li` in a Tile, Notice, Toast or Dialog file (use `DetailList`) | B9-01 | fail |
| 17 | `raw-radius` | A radius that is not a token | B9-07 | fail per folder as each sweep lands; all at B9-55 |
| 18 | `raw-spacing` | A spacing length that is not a token | B9-07 | same |
| 19 | `media-width` | A width query not in §11, or `useMediaQuery` with a width outside `ui/lib` | B9-07 | same |
| 20 | `status-tone` | `spoil`/`danger` outside `check-ui.allow-tones` | B9-17 | warn → fail at B9-55 |
| 21 | `focus-ring` | A `--focus-ring` box-shadow, or `outline: none` in `:focus-visible` outside the allow-list | B9-07 | fail per folder |
| 22 | `scheme-attr` | A `data-theme` selector; `prefers-color-scheme` outside `styles.css` | B9-07 | fail |
| 23 | `danger-sheet` | A danger confirm built outside `ConfirmDialog` | B9-18 | fail |
| 24 | `alert-in-form` | `role="alert"` inside a form component other than `FormError` | B9-16 | warn → fail at B9-55 |
| 25 | `no-history-back` | `navigate(-1)` / `history.back()` as a Cancel | B9-31 | fail |
| 26 | `no-first-choice-default` | `?? choices[0]` / `?? options[0]` in `features/` | B9-29 | warn |

**Extended rules:**
- `opacity-muting`: now 0.05–0.95, exempting pseudo-elements (B9-07);
- `word-break`: adds `overflow-wrap: anywhere` (B9-52);
- `type-scale`, `opacity-muting` and `word-break` `fail_paths`: every folder after its sweep.

**Playwright probes:**
- offline launch and response headers (B9-21);
- a 500 shows the error state within 2.5 s (B9-20);
- CLS ≤ 0.1 on `/` and `/plan` at 390 and 1280 (B9-44);
- focus after a row leaves (B9-34);
- an offline tick shows `[data-sync=pending]` (B9-54).

**Contrast tests.** Each package adds `theme/contrast.<slug>.test.ts` with the chapter's pairs. A11Y's and DS's re-measured figures are the expected values.

### The batched check-runner

- One check-runner agent, in its own worktree `/opt/mrwho/Projects/feeder-ng.worktrees/b9-ci`.
- For each batch it does the following:
1. Creates `ci/b9-wN[x]` from `main`.
2. Merges the approved team branches in the order section 4 gives (`git merge --no-ff`).
3. Runs `scripts/check.sh`, with output in its own `build/check.log`: the full profile with `PAGE_LAYOUT=quick` for W1–W8 batches, and `PAGE_LAYOUT=full` at the close of W1, W2 and W9 and for the release.
4. Returns a pass or fail per branch.
- On a failure it rebuilds the batch without the failing branch and re-runs, so the others are not held. The failing branch's reviewer fixes and re-approves.
- On a pass the main session runs `git checkout main && git merge --ff-only ci/b9-wN[x]`, chained with `&&` to a check log that says `CHECK PASSED`.
- Only one full check runs at a time, and developers and reviewers never run the full check.
- Merge commits are titled "Merge team/b9-<slug> (beta.9: <one line>)", as in beta.8.

## 10. Release

**Gates and steps (B9-57, after B9-56 is on `main`):**
1. All 57 packages are on `main`, and every chapter item is ticked in section 3.1. No open hand-backs remain.
2. On `ci/b9-w10`:
 - `PAGE_LAYOUT=full scripts/check.sh` passes, with `CHECK PASSED (CHECK_PROFILE=full)`, P1–P43 run, and zero findings on every route;
 - `make docker` builds;
 - `python3 scripts/changelog-avoid.py GLOSSARY.md CHANGELOG.md` is clean.
3. Release QA (below) on the built binary passes.
4. Release commit `release: 1.0.0-beta.9`:
 - `CHANGELOG.md` `[1.0.0-beta.9] - <date>` in the beta.8 format: one summary sentence, then **Added**, **Changed** and **Fixed** in user words with GLOSSARY terms (no "meal", "mode" or "icon" alone);
 - `deploy/helm/feeder/Chart.yaml` `version` and `appVersion: 1.0.0-beta.9`;
 - `deploy/helm/feeder/README.md` versions;
 - `docs/dev/deploy.md` "Upgrading from 1.0.0-beta.8 to 1.0.0-beta.9" (section 7).
5. A full check on the release commit, then `git merge --ff-only`, then `git tag v1.0.0-beta.9 && git push origin main v1.0.0-beta.9`, chained with `&&`.
6. After CI publishes, check anonymous pulls: `docker pull ghcr.io/fabbarix/feeder-ng:1.0.0-beta.9` and `helm pull oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.9`.

### Release QA checklist (main session, before the tag)

Run the built binary detached, with `FEEDER_DEV_LOGIN=1`, on two data directories:
- (a) a copy of a real beta.8 database: check that `feeder-pre-1570.db` is written, all eight migrations apply, existing ticks still Take back, the first-run checklist does not reappear, and Earliest start is 06:30;
- (b) an empty Household.

Re-walk every workflow of [flows/findings.md](../../build/ui-review-3/flows/findings.md) at **phone 390×844** (touch, Android UA), **tablet 820×1180** (iPad UA) and **desktop 1440×900** (keyboard only). Also run each at 320×568, 844×390 and in dark. Compare taps, typed fields and scrolls with the stage-1 tables.

- **A. First run:** five steps; time zone and currency confirmed; Meal Slots quick start; checklist hidden and shown again from Household.
- **B. Planning:**
- Swap gives the What changed toast, Review and Undo;
- a Bought meal does not move;
- a second User's Swap is shown;
- Couldn't plan "Mark Recipes" stays on the Plan;
- Away for a week (count the taps; FLOW-12 was 84);
- Regenerate Undo;
- the week grid at 820, 1440 and 1920.
- **C. Today:**
- the hero after the slot time;
- Advance Steps with Done;
- Leftovers actions on a phone;
- offline start;
- the Kitchen board: Close, portrait, 844×390, dark.
- **D. Cooking:**
- Get ready;
- Cook Mode at 390, 844×390 and 1440 (Step text 500);
- a timer outside Cook Mode and its finish alert;
- Cooked, then Correct Stock, then back to where it started;
- Undo Cooked from the sheet;
- a future meal's last Step;
- Freeze defaults.
- **E. Shopping:**
- tick one tap, Undo, Change;
- "More since your tick";
- a Line with a known Price and no purchase;
- "Get something else…";
- Scan with no camera (typed);
- a weighed code;
- the keypad stays clear of toasts;
- an offline tick, then sync (and a tick by a second User);
- receipt review Add….
- **F. Stock:** Pantry by Storage Place, Put away a whole shop, Keep, Throw out and Undo, Stock-take +1 and Undo.
- **G. Supplies:** Restock wording.
- **H. Recipes:**
- editor leave guard and reload draft;
- remove a Step with Undo;
- Tag chooser;
- compact list at 320;
- detail Cook tile at 1280;
- Import Review with a question;
- Export.
- **I. Catalogue:** Product page with a barcode check; Prices by Shop; Ingredient Rename; delete confirms.
- **J. Admin and notifications:**
- Allowlist "Copy sign-in message";
- Remove Member and Undo;
- remove a Meal Slot with Cooked history and restore it;
- Your preferences preview, Save and Discard;
- each notification URL opens its landing.
- **K. Spec'd jobs with no path:** confirm each one now has a path, or is recorded as out of scope.

**Cross-checks:**
- `document.title` and focus on every route;
- the skip link;
- forced colours (emulated);
- a 24 px browser text size;
- 400 % zoom (320×256);
- the update toast between two builds;
- no console errors.

**Handed to the user after the tag** (real devices; findings go to beta.9.x):
- iPhone Safari: keyboard and bar, notch insets, the landscape rail, push landing, camera and torch, Add to Home Screen;
- an Android phone: camera, haptics, beep, offline ticks in a shop;
- an iPad on the wall as the Kitchen board;
- Windows high contrast;
- VoiceOver or TalkBack on Today, Plan and Shop.

## 11. Risks

| # | Risk | Mitigation | Retired |
|---|---|---|---|
| 1 | **The tertiary-button and toast sweep touches every feature folder** (B9-01). A broken screen or a missed call site leaks into every later package. | B9-01 is the only package that edits `features/*.tsx` in W0. The change is mechanical (one attribute per call site, each `uiStrings.cancel` footer to `onCancel`, multi-sentence toasts to the rich anatomy), and rules 13–16 fail the moment it merges, so nothing can regress. P29 and P30 measure every tile, toast, footer and banner. The reviewer walks the Plan sheets, Today, the Shop notice and the Settings deletes in both schemes. | W0 |
| 2 | **rem type and em breakpoints** change every media query and every type size. | rem lands in B9-02 with a test proving identical px at 16 px. The em conversion uses one table in which every query equals its old px at default. P26 (resize walk), P27 and the `font-24` scenario catch drift. Each W1 sweep is per folder and must show no new findings. W1 closes with a full-profile run. | W1 |
| 3 | **Eight migrations in one family**, including a parent-table rebuild (1570) and a data move (1576). | The snapshot wiring and the full prefix list land first (B9-04, W0). Each migration has its own data test, `foreign_key_check` runs before commit, and startup tests cover beta.8, the beta.7 skip and beta.4.2. Release QA upgrades a real beta.8 database and rolls back from `feeder-pre-1570.db`. | W3 (last migration), confirmed in release QA |
| 4 | **Planner and runner changes:** restore and `undoToken`, Reopen, Bought held, Away and earliest start all touch the plan runner and planner. | Backend-first packages (B9-11 in W1, B9-12 in W1, B9-24 in W3), each owning distinct runner files (section 5). One restore mechanism. Go tests "Restore writes back the Snapshot exactly", "stale token 409", "A Bought meal is not changed", "A valid later meal is kept". The UI arrives in W4–W7 on stable APIs, and release QA walks B and D. | W4 (B9-26 merged), W7 (Away UI) |
| 5 | **The offline queue and Lines ticked twice** (RES-03): sync conflicts, a data-moving migration, and the interplay with SSP-01/02. | The backend (B9-23) lands in W3 with the additions model and the migration test. The online tick UI (B9-34) ships two waves before the offline UI (B9-54, W9). There is a check-ui offline scenario, the RES 2 rule is simple (always add), and Undo and Take back act per addition. Release QA walks an offline tick against a second User. The optional route splitting is deferred, so a service-worker change does not land on top. | W9 |

Two further risks, with smaller impact:
- the guard split (B9-03) could silently drop a rule. It is mitigated by the identical-findings diff in W0.
- shared files reopened late. This is mitigated by the ownership order in section 5 and the freeze after the last owner.
