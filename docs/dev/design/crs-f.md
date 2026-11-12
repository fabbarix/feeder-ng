# CRS team F: Today, Plan, Cook Mode and the kitchen board with Courses (design note for the Developer)

Step 1 of the pipeline (designer / test author) for team F of [crs-plan.md](crs-plan.md), branch `team/crs-f` from main `67e580e` (A, B, C1, C2, K, D1 and D2 are merged). Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §7.3, §7.5, §8, §11, §12, §16. API shapes: [crs-c2.md](crs-c2.md) (now on main). Timeline rules: [crs-k.md](crs-k.md).

The tests are red on purpose and only the new ones fail. The existing tests stay green and are **not edited** (that is what proves "one Course changes nothing"). What this commit adds besides tests: types (real), stubs that throw `CRS F: not implemented` or render `null`, and one fixture file per feature (`plan/test-utils.tsx` gains `planCourse`, `courseMeal`, `courseSlot`; `cook/timeline-fixtures.ts` is new).

Not in F: Couldn't plan tile and the setup checklist (G2; G2 goes after F on `plan/strings.ts`, `plan/types.ts`, `plan/api.ts`), Settings, Recipes, Shop, GLOSSARY, CHANGELOG, the spec, Go, the removal of the transition shims (C3), TG-PW.

## 1. Rules that shape everything

1. **One Course looks exactly as before.** Every component test file has a regression guard that renders a slot with a single Course in `courses` and a slot without `courses`, and compares `innerHTML` (day tile, hero, To confirm, Planned Meal sheet, Tonight tile, Step tile). These are green today and must stay green. Cook Mode has the same guards at screen level (`CookScreen.timeline.test.tsx`, last `describe`).
2. **`courseId` is optional until C3.** `SlotKey` gains `courseId?: number`. A key without it means the slot (Cook, the slot-wide actions) or, on a Planned Meal route, the **course-less alias for the main Course**. `planApi` builds `/api/plan/<date>/<slot>/<course>/…` when the key has a `courseId`, else the alias path. `lib/courses.courseKey(slot, course)` puts the `courseId` on a key **only when the slot carries `courses`**, so a fixture or an older payload without `courses` still hits the alias routes. C3 makes it required.
3. **`PlanSlot.meal` and `unfilled` stay the main Course's aliases** (C2). The SPA reads `courses` when present and falls back to **one main Course built from `meal`/`unfilled`** (`lib/courses.slotCourses`). Anything that asks "does this slot have a Planned Meal to cook" asks every Course (`plannedMeals`, `hasPlanned`), never `slot.meal` alone: a slot whose main Course is Cooked but whose Side is not is still the next meal.
4. **No logic in components.** Rows, captions, menus, labels, filters, gates and clock times are pure functions in `lib/` (plan: `courses`, `relaxed`, `toConfirm`, `chips`, `phrase`, `choose`, `hero`, `rules`; cook: `scope`, `timeline`, `reheat`; board: `tiles`); the hooks call them.
5. **The SPA does no scheduling.** The server sends the timeline (`cook.Timeline`); the SPA filters, numbers, labels, gates and starts timers.
6. **Scopes are compared in one place**: `cook/lib/scope.ts` `sameScope(a, b, mainCourseId)`. A two-part scope reads as the main Course, so it works before C3 (the main Course two-part on the wire) and after (always three-part). `mainCourseId` comes from `useCourses().main` (`lib/courses/useCourses`, imported from that module, not the barrel). While it is unknown a two-part scope equals only itself. `holdingTimers`, `partitionByScope` and `reheatTimerOf` (string `===`) stay as they are for the single-Recipe flow and their tests; every new Course path uses `sameScope`.
7. **Query keys carry the Course.** `['plan','alternatives',date,slot,course]`, `['plan','cook',date,slot,course]`, `['plan','recipe-choices',course|null]`, `['cook','view','timeline',date,slot]`. Two Courses of one slot must never share a cache entry.
8. **No native UI, Phosphor icons through `Icon`, shared primitives.** Rows, menus, sheets and chips use `Chip`, `IconButton`, `Menu`, `BottomSheet`, `NumberField`, `ListGroup`/`ListRow`. The slot menu and the Course menu are the shared `Menu` (popover from 768 px, sheet below). Icon names for new buttons exist already (`swap`, `pin`, `unpin`, `markCooked`, `cook`); the Developer adds none.

## 2. Plan and Today (feature `plan`, `today`)

### 2.1 Types (`plan/types.ts`, real in this commit)

`WhyCode` gains `cooldown_relaxed` and `variety_relaxed` (`best_available` stays in the union: an old stored chip may still arrive, and `phraseWhy` returns `''` for it). `PlannedMeal` gains optional `courseId`, `courseName`, `wholeMeal`, `relaxed`. New `PlanCourse` (`courseId, name, main, optional, optOutMemberIds, meal, unfilled, coveredBy, unserved`), `CoveredBy`, `Unserved`. `PlanSlot` gains `courses?`, `cookMinutes?`, `startBy?`, and, for the flat to-confirm and couldn't-plan entries, `courseId?`/`courseName?`. `Alternative` gains `wholeMeal?`, `covers?`, `relaxed?`. `Leftover.fromCourseId?`, `PlannedForMeal.courseId?`, `SlotRule.courseId?`, `RecipeChoice.courseIds?`, `MealSlotChoice.courses?`, `UnfilledReason` gains `no_course_recipes`. New `CookedAllResult`, `CookedAllEntry`, `SetMealResult`.

### 2.2 Libs

| File | Contract (tests: same-named `*.test.ts`) |
|---|---|
| `lib/courses.ts` | `slotCourses`, `courseKey`, `courseRows` (which Courses show a row: a Planned Meal, an `unfilled` reason or a not-yet-planned Course show one; covered, optional-and-empty and nobody-eats show none; history rows last; caption on every row only when two or more rows show), `withoutCaption` ("without Sam", "without Sam and Ada", "without 3"), `addableCourses`, `plannedMeals`, `slotMenu` (Mark all Cooked and Not cooked: whole slot when two or more Planned Meals are to cook and the date is today or past; "Add <Course>"; null for a one-Course slot), `heroRow`/`compactRows` (the main Course takes the hero when its Planned Meal is still to cook), `wholeMealChip`, `unresolvedCourseIds`. |
| `lib/phrase.ts` | `cooldown_relaxed`: "Again soon: had Sun" (the nearest cook is before the slot) or "Again soon: also on Thu" (after). `variety_relaxed`: "3rd fish this week" (ordinal of `value`: 2nd, 3rd, 4th, 11th, 21st) or "fish two days running" (`date`). |
| `lib/chips.ts` | The relaxed chip is a **neutral why chip** (`kind: 'why'`, no `status`). Day tile: only when nothing else to say. Hero: after the positive chips, still at most 2. Sheet: always visible; it takes the last visible place, the overflow count is the rest. A stored `best_available` makes no chip. |
| `lib/relaxed.ts` | `relaxedLine`: the sentence under the sheet's chips and its action (§1 of ADR 0009, point 9). Cool-down wins over Variety when both gave way. Main Course or a one-Course slot: **Add Recipes**; any other Course: **Mark Recipes as <Course>** (the Recipes list with `?notCourse=<id>`); Variety only: **Review Variety Rules** (`/settings/planning`). |
| `lib/choose.ts` | `alternativeNote`: "Whole meal: no Side" (several: "Whole meal: no Side, no Dessert"), else the relaxed chip, else the first why chip. |
| `lib/hero.ts` | `heroSelection`/`nextMeal`/`heroMeal` use `plannedMeals`. `slotCookLabel` ("Cook · 30 min" from the slot's `cookMinutes`, else the hero Recipe's own), `slotStartBy` ("start 18:30" from the slot, else the Recipe). |
| `lib/toConfirm.ts` | `groupToConfirm` (heading "Mon Dinner: Roast chicken, Green beans" for several Courses, the Recipe name for one), `allCookedBody` (fresh Courses only). |
| `lib/rules.ts` | `toSlotRuleBody` carries `courseId` only when chosen; `slotRuleTitle` "Friday Dinner · Main". |

### 2.3 API, hooks

- `planApi` (`api.courses.test.ts`): Course paths with a `courseId`, `cookedAll`, `notCookedAll`, `recipeChoices(courseId?)` (`GET /api/recipes?course=<id>`, keeps `courseIds` from `courses: [{id}]`), `addSlotRule` with `courseId`. `useRecipeChoices(enabled, courseId?)` is real already.
- `usePlanActions.notCookedSlot(slot)` (`POST …/all/not-cooked`, same refresh-and-error contract as the others).
- `useMarkAllCooked(slot, courseIds)`: one `GET …/{courseId}/cook` per Course, `rows` in the order given, `setLeftover` (clamped, Leftover Courses ignored), `confirm` (`POST …/all/cooked`, body = `allCookedBody(rows)`, plan refetched, warnings kept, error text "That could not be saved. Nothing was changed."). `useAllCookedFlow()` wraps it with the open state; it is what Plan, Today and Cook Mode share (`CookFlow` is **not** changed, so its tests stay).
- `usePlanLiveUpdates` also subscribes to topic `household` and refetches `['plan']` for `changed` in `courses`, `mealSlots`, `attendance` (names, order and opt-outs are on the plan); nothing for other changes.
- `usePlanScreen`: the Add <Course> flow opens the chooser with `useRecipeChoices(open, key.courseId)`; "Mark Recipes as <Course>" navigates to `/recipes?notCourse=<id>`, "Add Recipes" to `/recipes`, "Review Variety Rules" to `/settings/planning`.

### 2.4 Components

New: `CourseRow` (a `<li aria-label="{Course}">`; caption; Recipe name button; one day chip plus the Whole meal chip; `IconButton`s per `actions` from `['swap','pin','cooked']`; dashed Not planned block with "Choose a Recipe" when empty; muted without buttons when Cooked or Not cooked; `data-compact` when compact), `SlotMenu` (`Menu` labelled "<Slot> actions"), `MarkAllCookedSheet`. Changed: `MealTile` (several rows: `<ul aria-label="<Slot> Courses">`, slot name once, **Cook once on the slot head** and it reports the slot key; Swap per Course; compact 7-column week: rows without per-Course buttons, Cook on today only; the slot menu), `DayTile` passes the new handlers, `TonightHero` (main row is the hero; the other Courses are compact rows with Swap, Pin and Mark as Cooked; "start" and "Cook · N min" are the slot's; after the slot time and with several Courses to cook the heading is "Dinner cooked?" with one primary **Mark all Cooked**; with one Course left it behaves as a one-Course hero **with that Course's key**), `ToConfirmTile` (groups; per-Course buttons in a `role="group"` named by the Course; "Mark all Cooked" when a group has two or more), `PlannedMealSheet` (`courseId` prop; "Tue Dinner · Side"; the Course's portions; avatars = the slot's attendance without the Course's opt-outs; relaxed line and its action buttons; actions carry the Course key except **Cook, which is the slot's**), `SwapSheet` (`alternativeNote`), `RecipeChooserSheet` (title and list for the Course), `PlanScreen` and `TodayScreen` wire all of it.

## 3. Cook Mode (feature `cook`)

Routes: `/cook/meal/:date/:slotId` opens the **timeline**; `/cook/meal/:date/:slotId/:courseId` opens it on that Course's chip; `/cook/reheat/:date/:slotId[/:courseId]`. The old two-part meal view and its tests stay (the Recipe flow and the alias).

- Types (`cook/types.ts`, real): `TimelineView`, `TimelineItem`, `TimelineCourse`, `TimelineAdvance`, `CookTimelineTarget`.
- `cookApi.timeline(date, slot)` and `cookApi.courseView(date, slot, course)` (stubs).
- `lib/scope.ts`: `courseScope`, `parseMealScope`, `sameScope`, `cookTimelinePath`, `timelineTargetFrom`; `lib/reheat.ts`: `cookReheatPath` gains the Course segment, `reheatTimerOfCourse`.
- `lib/timeline.ts`: `visibleItems` (All: positions over the timeline; a Course: its own 1..M), `filterChips` (none unless two Courses have items), `plannedClock` (slot time minus total plus the item's start, floored to the minute), `itemCaption` ("Side · Green beans", only with several Courses), `toCookStep`, `holdingTimersFor`, `advanceGroups`, `courseMenuEntries`, `unresolvedCourses`.
- `useCookTimeline(target)` (`['cook','view','timeline',date,slot]`): filter, **per-filter positions** (kept when you change chip), a timer starts **once** per (Course, Step) when a Passive item is reached, in the item's own scope; a Reheat item starts the free Reheat timer `{scope, label:'Reheat', durationSeconds}` unless `reheatTimerOfCourse` finds one (it waits for the timers query); refetch on topics `cook`, `plan`, `household` and reconnect; position clamped when items leave.
- `useItemGate(items, index, timerItems, mainCourseId, next)`: `useStepGate` for the timeline (same texts); the next item of the **current filter's list** is held only by its own Course's `after` timers.
- Components: `CourseFilterChips` (`role="group"` "Courses" of `Chip kind="filter"` with `aria-pressed`), `CourseMenu` (`Menu` "Course actions": "Mark Side as Cooked", "Not cooked: Side"), `TimelineAdvanceTile` (grouped by Course, shown on the first item as the single-Course tile is today), and optional props on `StepTile` (`caption`, `clock`), `CookNavTiles` (`markLabel`), `CookTimerStrip` (`belongs`).
- `CookScreen`: title is the slot name for several Courses and the Recipe for one (as before); chips; timers: **every timer of the slot's Courses** under "Timers" whichever chip is chosen; the last item of All offers **Mark all Cooked** (`useAllCookedFlow`), the last item of a Course view or of a one-Course timeline offers **Mark as Cooked** for that Course (`useMarkCooked` with the Course key, so `…/{courseId}/cooked`); the Course menu cooks or skips one Course at any time and **the screen stays** while other Courses remain (the confirmation page replaces it only when no Course is left). "Today" for `mayResolve` is `usePlan().today`: the timeline payload has no `today` (gap 2).

## 4. Kitchen board (feature `board`)

`BoardData.slots` (the plan's shape, today and tomorrow) is read when present (`boardSlots`), else `/api/plan` as before (older payload and the existing screen tests). `hasPlanned`, `tonightRows`, `tomorrowLine` in `lib/tiles.ts`. `TonightTile`: a `<ul aria-label="Tonight's Courses">` with one row per Course that has a Planned Meal (the main Course's row `data-main="true"`, the larger); a one-Course slot is rendered exactly as before; **one** big Cook button, opening `/cook/meal/<date>/<slot>`. `TomorrowTile`: "Dinner: Roast chicken + Green beans" for several rows, "Dinner · Chicken stew" for one. No chips on the board. `NextAdvance` gains `courseId`/`courseName`; Done sends `scope` as the server sent it. `useBoard` also refetches on `household` (`courses`, `mealSlots`, `attendance`).

## 5. Live updates (summary)

`plan` (existing) + `household`/`courses|mealSlots|attendance` → plan queries, board, cook timeline. `cook`, `timers` unchanged. `stock` unchanged.

## 6. Tests (red) and the guards that are green today

| Area | Files |
|---|---|
| Plan libs | `lib/courses.test.ts`, `phrase.relaxed.test.ts`, `chips.relaxed.test.ts`, `relaxed.test.ts`, `choose.courses.test.ts`, `hero.courses.test.ts`, `toConfirm.test.ts`, `rules.courses.test.ts` |
| Plan API and hooks | `api.courses.test.ts`, `hooks/useMarkAllCooked.test.tsx` (with `useAllCookedFlow` and `notCookedSlot`), `hooks/usePlanLiveUpdates.courses.test.tsx` |
| Plan components | `CourseRow.test.tsx` (keyboard, ARIA), `MealTile.courses.test.tsx`, `SlotMenu.test.tsx`, `MarkAllCookedSheet.test.tsx`, `TonightHero.courses.test.tsx`, `TodayTiles.courses.test.tsx`, `PlannedMealSheet.courses.test.tsx`, `SwapSheet.courses.test.tsx` |
| Plan and Today screens | `screens/PlanScreen.courses.test.tsx`, `today/components/TodayScreen.courses.test.tsx` |
| Cook | `lib/scope.courses.test.ts`, `lib/reheat.courses.test.ts`, `lib/timeline.test.ts`, `api.timeline.test.ts`, `hooks/useCookTimeline.test.tsx`, `hooks/useItemGate.test.tsx`, `components/CourseFilterChips.test.tsx`, `CourseMenu.test.tsx`, `StepTile.caption.test.tsx`, `TimelineAdvanceTile.test.tsx`, `CookNavTiles.markLabel.test.tsx`, `screens/CookScreen.timeline.test.tsx` |
| Board | `lib/tiles.courses.test.ts`, `components/BoardTiles.courses.test.tsx`, `hooks/useBoard.courses.test.tsx`, `screens/BoardScreen.courses.test.tsx` |

Green on purpose (guards that must stay green): the `innerHTML` equality tests of one Course, "a slot without `courses` keeps the course-less routes", "no caption/list/menu on a one-Course slot", `best_available` makes no chip, the old two-part cook view path, `startCookPath` for a plain slot, `NextAdvanceTile` Done passthrough, `usePlanLiveUpdates` on `plan`.

## 7. Gaps and decisions for the Project Manager

1. **Existing Cook Mode tests mock the two-part `GET /api/cook/meals/<d>/<s>`.** Once `/cook/meal/:date/:slotId` loads the timeline (`…/all`), `CookScreen*.test.tsx`, `CookScreen.stepGate.test.tsx` and the other screen tests that open a Planned Meal need only their **stub keys** changed to `…/all` with a one-Course timeline (assertions untouched). I did not edit them: they are green now and the timeline guards in `CookScreen.timeline.test.tsx` cover the same behaviour. The reviewer checks that only stub keys changed there.
2. **`GET …/all` has no `today`.** Cook Mode takes the household date from `usePlan().today`. If the PM prefers it in the payload, C2/C3 adds `today` and the screen reads it.
3. **Strings.** Tests pin the words; the Developer adds them to `plan/strings.ts`, `cook/strings.ts`, `board/strings.ts` (G2 follows on `plan/strings.ts`).
4. **Wording decided here** (the spec gives examples only): Course caption "Side · without Sam"; Whole meal chip text "Whole meal" (status `info`); "Whole meal: no Side, no Dessert"; menu entries "Mark all Cooked", "Not cooked: whole slot", "Add <Course>", "Mark <Course> as Cooked", "Not cooked: <Course>"; menu labels "<Slot> actions" and "Course actions"; list names "<Slot> Courses" and "Tonight's Courses"; hero after the slot time "Dinner cooked?" with **Mark all Cooked**; the tomorrow line joins Recipe names as they are written (no case change); the Slot Rule row title "Friday Dinner · Main" with the meta unchanged.
5. **Slot Rule form.** `lib/rules.ts`, `api.addSlotRule` and `RecipeChoice.courseIds` are covered; the form (`RulesEditors`, `useRuleForms`: a `CourseSelect` limited to the chosen Meal Slot's Courses, default the main Course, shown only when the slot serves several, and a Recipe rule offering `recipesForCourse`) has **no component test** in this commit. Existing `RulesEditors.test.tsx` stays valid. The Developer adds the component test with the implementation or the PM asks me for it.
6. **No test for `Today`'s AdvanceStepsTile with `courseId`** (types only): the server field has nothing to show.
7. **Page layout guard** unchanged (no new routes except the two Course-suffixed ones under existing prefixes).

## 8. Review round 1: tests added, and the contract the Developer implements to

The reviewer found five gaps. Their tests are red on purpose. Files: `cook/lib/timeline.logic.test.ts`, `cook/screens/CookScreen.resolved.test.tsx`, `plan/lib/cook.all.test.ts`, `plan/lib/toConfirm.courses.test.ts`, `plan/lib/hero.reheat.courses.test.ts`, `plan/hooks/useAllCookedFlow.outcome.test.tsx`, `plan/screens/PlanScreen.allCooked.test.tsx`, `today/components/TodayScreen.allCooked.test.tsx`, `plan/components/TonightHero.reheat.courses.test.tsx`, `board/boardCss.tonight.test.ts` and a case in `board/components/BoardTiles.courses.test.tsx`. `plan/test-utils.tsx` gains `allCookedResult()`.

### 8.1 A chip whose Course has resolved (spec 11)

`lib/timeline.effectiveFilter(view, filter): CourseFilter` returns `'all'` when `filter` is a Course id that has **no item** in `view.items` (it was Cooked or skipped, or is not in the slot), and `filter` otherwise. A timeline with no items stays on `'all'`. `useCookTimeline` runs `visibleItems`, the position memory and `filterChips` selection through the effective filter and returns it as `filter`, so the chip pressed, the list and the position agree. The last Course on its own keeps its chip (same list as All). Result: after "Mark Side as Cooked" on the Side chip the screen shows All with the Main's items (never the empty "No Steps" page and never Mark as Cooked on an empty list); `/cook/meal/<d>/<s>/<courseId>` for a Course already resolved opens on All.

### 8.2 The outcome of Mark all Cooked (spec 8, 11)

The single path shows: `CookFlowSheets` (Stock shortfall `ShortfallNotice` with Correct Stock and Dismiss, `StockCorrectionSheet`), the success toast (`cookedSuccessText`) and, in Cook Mode, `CookedConfirmation` (`leftoverOutcomeText`). Mark all Cooked shows the same, from `CookedAllResult`.

`plan/lib/cook.ts`, pure:
- `cookedAllOutcomes(result: CookedAllResult): LeftoverOutcome[]`: one per entry of `result.leftovers`, in order. A planned meal belongs to the Leftover whose `fromCourseId` equals its `courseId`; with exactly one Leftover every `plannedFor` is its own (also without `courseId`). No Leftover gives `[]`.
- `cookedAllOutcomeText(result): string`: `[]` gives "No Leftovers"; one Leftover gives `leftoverOutcomeText` as is; several give `"<Recipe>: <sentence>"` joined by `". "` ("Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept, good until Fri").
- `cookedAllSuccessText(result): string`: no Leftover: "Cooked, nice one!"; one Leftover: exactly `cookedSuccessText` of the single Course; several: cheer + `"<Recipe>: <part>"` where part is "2 portions → Thu Lunch" or "1 portion kept, good until Fri", joined by `"; "`.

Hooks and components:
- `useAllCookedFlow` shows the success toast (`cookedAllSuccessText`, status success) on a successful `confirm()`, and returns `stock: StockSheetController` (`useStockSheet`, dismissing the warning on save) and `warnings` / `dismissWarning`. A new component `AllCookedSheets({ flow })` (plan, exported from the barrel) renders the shortfall notices, the `MarkAllCookedSheet` and the `StockCorrectionSheet`; Plan and Today use it instead of the bare sheet.
- `useMarkAllCooked` starts a fresh sheet whenever the slot is **opened**: `open` (null to key) clears the error, the result, the dismissed warnings and the edited Leftovers, so closing and reopening the same slot after a failed confirm shows no old error. A successful result still survives the **close** (the notices stay up) until the next open.
- Cook Mode (`TimelineCookScreen`): after Mark all Cooked, `CookedConfirmation` shows `cookedAllOutcomeText` and the controller's warnings with Correct Stock and Dismiss. Its title line is `lib/timeline.confirmationName(view, cookedCourseIds): string`: the Recipe name when one Course was Cooked (not `courses[0]`, which may be a Cooked Course of an earlier round), the **slot name** when several were, the slot name when none, `''` without a view.

### 8.3 Today hero Reheat with several Courses (spec 11)

- (a) `SeveralCoursesHero` calls `onReheat(hero.key)` (the hero Course's key with `courseId`), also before the slot time, not the course-less slot key.
- (b)/(c) `lib/hero.heroSelection`: `action` is `'reheat'` (today) or `'leftover'` (later day) only when **every** Course still to cook is served from a Leftover; if any unresolved Course is fresh the action is `'cook'` today and `'none'` later, whatever the hero Course is. Cook opens the slot's timeline, which holds the Reheat items of the Leftover Courses.

### 8.4 Logic out of the components (CLAUDE.md: no business logic in components)

`cook/lib/timeline.ts` (tests: `timeline.logic.test.ts`), extracted from `TimelineCookScreen`, which then only wires them:

| Function | Contract |
|---|---|
| `allMode(filter: CourseFilter, unresolved: {courseId:number}[]): boolean` | `filter === 'all' && unresolved.length >= 2` |
| `markTarget(allMode: boolean, currentCourseId: number \| null, unresolved: {courseId:number}[]): number \| null` | null in all mode; else the current item's Course, else the first unresolved, else null |
| `canMark(date: string, today: string, unresolved: {courseId:number}[]): boolean` | `mayResolve(date, today) && unresolved.length > 0` |
| `finishedCooking(s: { cookedAny: boolean; notCookable: boolean; loaded: boolean; unresolvedCount: number }): boolean` | `cookedAny && (notCookable \|\| (loaded && unresolvedCount === 0))` |
| `leaveIfNothingLeft(unresolvedCount: number, cookedAny: boolean): 'leave' \| 'refresh'` | `'leave'` when at most one Course was unresolved (the one skipped) and nothing was Cooked here; else `'refresh'` |
| `title(view: TimelineView, several: boolean): string` | several: the slot name; else the first planned Course's Recipe, else the slot name |
| `confirmationName(view: TimelineView \| undefined, cookedCourseIds: number[]): string` | see 8.2 |
| `effectiveFilter(view, filter)` | see 8.1 |

`plan/lib/toConfirm.ts` (tests: `toConfirm.courses.test.ts`): `toConfirmCourses(entries: PlanSlot[], key: SlotKey): number[]`, the `courseId` (0 for the course-less alias) of each flat to-confirm entry of that date and Meal Slot, in entry order. `TodayScreen` calls it instead of its inline filter.

### 8.5 Board legibility (spec 7.5)

`board.css`, tokens from the file itself: `.board-tonight__course[data-main='true']` in `rem` from 75% of `.board-tonight__recipe` (3.25rem) up to it (use 2.75rem); `.board-tonight__course` smaller than the main row but at least `.board-tonight__slot` (1.75rem); `.board-tonight__course[data-state='cooked'] { color: var(--color-muted) }`. `TonightTile` puts `data-state={row.state}` on each row `<li>` (Cooked Courses stay on the list, muted). The one-Course markup does not change.
