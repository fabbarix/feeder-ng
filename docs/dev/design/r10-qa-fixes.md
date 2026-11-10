# R10 final-QA fixes (design note)

Source: QA report round 2 (N1-N4, N7, N10, offline cold reload). Tests are written first and are red; stubs only.

## N1 "Leftover from Mon" on a stored Leftover (Medium)
Cause: the planner emits `LeftoverSource{LeftoverID}` with a zero `FromSlot` for an actual Leftover, `plan.Reconcile` stores it, so `servedFromLeftover.date` is "".
- `internal/plan/plan.go` `Reconcile`: when `p.From.LeftoverID != 0` and its slot is zero, fill `From.From` from `s.Leftovers[id].From`. Test: `TestReconcileFillsTheSourceSlotOfAStoredLeftover`.
- `internal/plan/httpapi/shapes.go` `mealFor`: fallback for rows already stored empty: `table.leftoverFrom[LeftoverID]` (field added in names.go). `names.load` (or the handlers' table builder) fills it by `store.Leftover(ctx, id)` for each distinct LeftoverID of the meals being rendered (consumed Leftovers are not in `Leftovers()`, so look up by id). Tests: `TestMealServedFromAStoredLeftover...`, `TestMealServedFromAPlannedExtra...`.
- `web/src/features/plan/lib/chips.ts` + `strings.ts`: an empty date gives the chip "Leftover" (never a weekday). Test: chips.test.ts "N1".
- Files: plan.go, shapes.go, names.go, plan/lib/chips.ts, plan/strings.ts (+ tests).

## N2 phone Leftovers tile (Medium)
Cause: ListRow's fixed 64 px height, nowrap/ellipsis title and 40 px lead icon in a half-width (about 170 px) cell.
Layout: stacked name over meta, name wraps, meta wraps, no lead icon (the tile overline carries it), rows auto-height.
- `TodayTiles.tsx`: `LeftoversTile` Tile gets `className="plan-leftovers"`.
- `plan.css`: `.plan-leftovers .list-row[data-height]` (block-size auto, min-block-size 64px, padding-block space-2, padding-inline space-3), `.plan-leftovers .list-row__title` (white-space normal, overflow-wrap anywhere, no ellipsis), `.plan-leftovers .list-row__meta` (flex-wrap wrap), `.plan-leftovers .list-row__lead` (display none). Contract: plan-css.test.ts "N2"; TodayTiles.test.tsx.
- Files: TodayTiles.tsx, plan.css.

## N3 Today hero selection (Medium)
New pure `lib/hero.ts`: `heroSelection(slots, now, today): {slot, day: 'today'|'tomorrow'|'later', action: 'cook'|'leftover'|'none'} | null` and `heroDayOverline(sel)`.
- Candidates: state planned, within the 2 h grace (as `heroMeal`), earliest first. Today's first; else the first future one.
- `day` from the date difference to `today` (1 day = tomorrow). Overline: today `DINNER · 19:00`; tomorrow `TOMORROW · LUNCH`; later `FRI · LUNCH`.
- `action`: `servedFromLeftover` -> `leftover` (no Cook, shows the "Leftover from <day>" chip); fresh and due today -> `cook`; fresh and not today -> `none` (no Cook).
- `TonightHero` takes `day`, `action` (defaults today / cook). Cook button only for `cook`; Yes, Cooked / Adjust only when day is today and the phase is awaiting; the Leftover chip is shown whenever the meal is Leftover-served (heroChips plus the leftover chip).
- `seams.ts`: `nextSlot` becomes the `HeroSelection` (`useTodayTileData` needs `planToday`); `TodayScreen` passes day/action. `heroMeal` stays exported for existing users.
- Files: plan/lib/hero.ts, plan/components/TonightHero.tsx, plan/index.ts, today/seams.ts, today/components/TodayScreen.tsx.

## Offline cold reload (shared shell, owned here)
Cause: react-query's default `networkMode: 'online'` pauses `/api/me` while `navigator.onLine` is false, so AppRoot stays on "Loading"; a plain network failure becomes `loadError`.
Decision: remember the last successful `/api/me` in **localStorage** key `feeder.me` (service-worker cache rejected: the SW must not hold authenticated API responses). Privacy: it is the User's own profile (id, email, displayName, isAdmin) on their own device; it is cleared on 401 and on sign-out. Not a credential; the session cookie is untouched.
- New `web/src/app/meCache.ts`: `readCachedMe` (validates shape, never throws), `writeCachedMe`, `clearCachedMe`, `ME_CACHE_KEY`.
- `useMe.ts`: `networkMode: 'always'`; success writes the cache; 401 clears it and returns null; `ApiError` status 0 (`network` or `timeout`) returns the cached Me if valid, else rethrows; any other error rethrows.
- `AppRoot.tsx`: sign-out also clears the cache. The OfflineBanner already shows through `ShellStatus` (`useConnectivity`).
- Files: app/meCache.ts, app/useMe.ts, app/AppRoot.tsx (shared shell).

## N4 timers survive Mark as Cooked (Low)
Rule: Cooked or Not cooked cancels that meal's scope timers (`meal:<date>/<slot>`), explicitly in the same flow, not via an event.
- `cook/service`: `CancelScope(ctx, scope) (int, error)` deletes the scope's timers and publishes `cancelled` for each.
- `plan/runner`: `Deps.OnResolved func(ctx, key)`, called after the commit by `Cooked` and `NotCooked` (not on error or `ErrAlreadyResolved`).
- `plan/httpapi` mount builds a cook service (store + clock + bus only is enough) and passes `OnResolved` that calls `CancelScope(MealScope(key))`, logging failures.
- Files: cook/service/service.go, plan/runner/runner.go + actions.go, plan/httpapi/httpapi.go.

## Copy (Low)
- Unit plurals: `baseUnitLabel(base, system, count?)`: piece is "pieces" unless count is 1 (so "2 pieces"); `TickSheet` passes the typed value; the Unit Conversion question always uses the plural ("How many pieces is 1 cup of onion?"), via `recipeStrings.unitConversion.question`/`promptQuestion`. Files: lib/units.ts, shop/components/TickSheet.tsx, recipes/lib/unitPrompt.ts.
- Scans: `scanStrings.queued/rejectedCount` -> "1 Scan / 2 Scans ..." (also ScanScreen). File: scan/strings.ts.
- Timer label: `CookTimer.recipeName` (server adds it to `GET /api/cook/timers` items via `Service.ScopeRecipeName`); `timerPlace(scope, current, recipeName?)` returns the name, else the old wording. Files: cook/service/service.go, cook/httpapi/httpapi.go (timerDTO), cook/lib/timers.ts, cook/components/CookTimerStrip.tsx, cook/types.ts.
- Stray "· ": drop `.spoiled-tile__when::before`; `.spoiled-tile__detail` uses `column-gap: var(--space-2)` and wraps. File: stock/stock.css.

## robots.txt (N10)
`internal/app/spa.go`: `GET /robots.txt` returns `text/plain` `User-agent: *\nDisallow: /\n` before the SPA fallback (a private household app). Test: `TestRobotsTxtIsServedNotTheSPAIndex`. No BDD: HTTP unit tests and component tests cover every item.
