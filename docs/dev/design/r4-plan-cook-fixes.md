# R4 plan-cook-fixes: design (QA round 2: B8, B10, B13, B14)

Scope: functional-spec §7, §8, §11. Builds on [t3](t3-planner-core.md), [t11](t11-planning.md), [t14](t14-cook-board.md). UI is wired from existing `ui/` primitives with no native controls; the visual redesign (ui-fix-plan §4.12, §5.12) comes later, so all logic lives in `lib/` and hooks. Slot Rule / Cool-down behaviour is not touched. Live-update hooks (`use*LiveUpdates`, `useTimers.ts`) are R1's and are not edited.

## B8 stale "leftovers for <day>" chip
Cause: the planner stores a `leftover_fits` why chip (Date = day the extra portions will be served) on the *source* meal when it is placed. After Mark as Cooked with a smaller Leftover the dependant is replanned fresh, but a Cooked source is never rewritten by `Reconcile`, so the chip stays.
- Pure rule `plan.PruneStaleLeftoverChips(meals []Meal) []Meal`: returns copies (only the changed ones) of meals whose `leftover_fits` chip dated D has no non-skipped meal on D with `From.From == meal.Key`. Other chips keep their order. A Cooked dependant still counts (the chip was true).
- Runner: at the end of every write (`planIn`, after `Apply`), load the horizon's meals (incl. Cooked and unresolved), run the rule, `SaveMeal` the changed ones. So Cooked, Not cooked, Swap, rules and nightly runs all clean up. No planner change.

## B10 future meals cannot be resolved
- `plan.MayResolve(date, today string) bool` (date <= today, string dates; false when unparseable) and `plan.ErrFutureMeal`.
- `Runner.Cooked` and `Runner.NotCooked` check it first (household date from `info.today`) and return `ErrFutureMeal` with nothing changed. `CookPreview` stays unguarded (read only).
- HTTP: 409 `future_meal` ("This meal is not due yet") from `POST .../cooked` and `.../not-cooked`.
- `service.CookView.Today` (household date, zone of the Household) and JSON `today` on `GET /api/cook/meals|recipes`.
- Client: `plan/lib/resolve.ts mayResolve(date, today)`; `MealTile` gets `today` and shows Mark as Cooked only when due (Swap/Confirm/Unpin stay); `CookScreen` offers Mark as Cooked only when `mayResolve(view.meal.date, view.today)`. The "To confirm" tile is past by definition.

## B13 Cooked confirmation
- `runner.CookedResult.PlannedFor []plan.Key` from pure `plan.LeftoverPlannedFor(src Key, meals []Meal) []Key` (meals served from the source, not skipped, date then slot order), computed after the replan, so a shrunk Leftover lists nothing.
- API: `POST .../cooked` adds `plannedFor: [{date, mealSlotId, mealSlotName, recipeName}]` (always an array).
- Client: `plan/lib/cook.ts` `leftoverOutcome(result)` (`none | kept | planned`) and `leftoverOutcomeText`: "No Leftovers", "1 portion kept, good until Thu", "2 portions planned for Tue Dinner" (several: "... Tue Dinner and Wed Dinner"). `useMarkCooked` exposes `outcome` (null until success).
- `CookScreen`: once `marked.result` exists it renders `CookedConfirmation` (heading "Marked as Cooked", Recipe name, outcome as role status, Stock `ShortfallNotice`s and `StockCorrectionSheet` as children, button "Back to Today") instead of the Step and nav tiles, even when the refetched view says `not_cookable` (409). Decision: the User leaves with the button (no timed redirect); Mark as Cooked is never offered again. Not cooked still leaves at once. The old "leaves at once / leaves when the warning is fixed" tests are replaced.

## B14 timers in Cook Mode
- `CookScreen` calls `useTimers()` with no scope (all household timers); `CookTimerStrip` takes `scope` and splits with `cook/lib/timers.partitionByScope` into region "Timers" (this scope) and "Other timers" (other scopes, free timers) with `timerPlace` hints ("Tue meal", "another Recipe"; recipe names would need a server change, deferred).
- Explicit buttons from `timerActions(state)`: running Pause + Cancel timer, paused Resume + Cancel timer, finished Dismiss; accessible names "Pause <label>", "Resume <label>", "Cancel timer <label>", "Dismiss <label>". Tapping the tile keeps its toggle behaviour. API and `useTimers` are unchanged.

## Files
Go: `internal/plan/cook.go` (+ tests), `runner/actions.go`, `httpapi` (error code, `plannedFor`), `internal/cook/service` (Today), `httpapi` of cook (JSON). Web: `plan/lib/{resolve,cook}.ts`, `plan/hooks/useMarkCooked.ts`, `plan/components/MealTile.tsx`, `plan/screens/PlanScreen.tsx`, `cook/lib/timers.ts`, `cook/components/{CookTimerStrip,CookedConfirmation}.tsx`, `cook/screens/CookScreen.tsx`, `cook/strings.ts`, `plan/strings.ts`.
Tests: Go `plan/cook_test.go`, `plan/runner/actions_test.go`, `cook/service/service_test.go`; BDD `planning/cooked.feature` (+ steps), `cook-board/cook_mode.feature`; vitest as listed in the commit.
Stubs left red on purpose: `plan.MayResolve`, `PruneStaleLeftoverChips`, `LeftoverPlannedFor`, web `mayResolve`, `leftoverOutcome(Text)`, `partitionByScope`, `timerActions`, `timerPlace`, `CookedConfirmation`, `useMarkCooked.outcome`.
