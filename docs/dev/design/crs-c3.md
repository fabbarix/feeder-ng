# CRS team C3: the course-less routes and the compatibility shims go (design note for the Developer)

Step 1 of the pipeline (designer / test author) for team C3 of [crs-plan.md](crs-plan.md) §2.2, branch `team/crs-c3` from main `b949474` (A to G2, C-RX and TG-* are merged, TG-RW is not). Decisions: [ADR 0008](../../adr/0008-courses.md). Spec: functional-spec §16. Related: [crs-a.md](crs-a.md) §3.5 and §3.6 (the two shims), [crs-c2.md](crs-c2.md) (the aliases), [crs-f.md](crs-f.md) (the SPA dependencies recorded by the F reviewer).

The tests are red on purpose and only the new or changed ones fail (§7). After this change the Planned Meal key is `(date, Meal Slot, Course)` everywhere with the **real id** of the Course, the main Course included. Nothing, inside or outside, sends or reads Course `0` or a two-part scope.

## 1. Server routes

Removed. They answer `404 not_found` for **every method** (the old SPA still cached by the service worker must not mark anything), not `405`:

| Removed | Was |
|---|---|
| `PUT /api/plan/{date}/{slotId}` | set the main Course |
| `POST /api/plan/{date}/{slotId}/confirm`, `/unpin`, `/cooked`, `/not-cooked` | main Course only |
| `GET /api/plan/{date}/{slotId}/alternatives`, `/cook` | main Course |
| `GET /api/cook/meals/{date}/{slotId}` | the main Course's single view |

How: the routes are not registered, and `internal/plan/httpapi` registers the six old words explicitly (`/api/plan/{date}/{slotId}/{word}` for `confirm`, `unpin`, `alternatives`, `cook`, `cooked`, `not-cooked`, any method, one handler that answers `404` with the usual `not_found` body) because otherwise Go's ServeMux answers `405` through `PUT …/{slotId}/{courseId}`. The cook two-part path needs nothing: no pattern has two segments after `meals/`, so it is a plain `404`. `key()` in `plan/httpapi/handlers.go` stops treating a missing `{courseId}` as 0; a `{courseId}` that is not a number above 0 (so `0` too) is `404`.

Stay: the `{courseId}` routes, the literal `…/all/cooked`, `…/all/not-cooked`, `GET …/all` (cooking timeline), the lists, `couldnt-plan/exclusions`. `POST /api/slot-rules` without `courseId` keeps defaulting to the main Course: that is a spec'd default (§16), not an alias; the runner resolves it **before** the store.

**Slots lose `meal` and `unfilled`** (spec §16, crs-plan §2.2 shim 3): `slotOut`, `SlotView.Meal/Unfilled` and `BoardSlots` carry the Planned Meal and the reason on the Course rows only. Because the alias is where `meal.startBy` and `meal.cookMinutes` (the Recipe's own time) were computed, **each Course row's `meal` now carries `startBy`** (slot time minus the Recipe's own `cookMinutes`; omitted when unknown or served from a Leftover), as `slotFor` set it on the alias. The flat entries of `GET /api/plan/to-confirm`, `/couldnt-plan` are one entry per Course and keep their own `meal` / `unfilled`.

Spec correction for H: the cook scope error is `422 invalid_scope` (code and BDD since T-cook), not `400` as §16 says.

## 2. Cook scopes: three-part everywhere, the store shim goes

Decision: **the main Course's scope is `meal:<date>/<slot>/<course id>`, like every other Course's.** Migration 1400 already rewrote what is stored; the only reason for the two-part form was an old SPA that compares scopes as strings, and the SPA ships in the same binary.

- `cook.MealScope(date, slot, course)` always writes three parts. Course `0` writes `…/0`, which `ParseScope` refuses (a caller bug shows at once, it never reads as the main Course).
- `cook.ParseScope` refuses the two-part form (`ErrInvalidScope`). Handlers answer `422 invalid_scope` for a timer or a mark on a two-part scope; the listing filter `GET /api/cook/timers?scope=` stays unvalidated as today.
- `internal/cook/store`: `mainID`, `storedScope`, `callerScope` are deleted. The store keeps a scope exactly as given and reads it exactly as stored (and no longer reads `courses`). A two-part string is just a string; the service and handlers refuse it before it gets there.
- `internal/cook/service`: `MealView` is deleted; `CourseView(date, slot, course)` requires a real id (`course <= 0` is `ErrNotFound`); `courseScope` always three-part (the `MealInfo.Main` field stays as data, it no longer changes the scope); `adapters.go` `Meal(...)` loses the `courseID == 0` main lookup.
- `OnResolved` (plan httpapi) cancels `MealScope(date, slot, key.CourseID)` with the real id; this test passes before and after (`TestResolvingTheMainCancelsTheTimersOfItsThreePartScope`).

## 3. The plan store shim goes completely

Decision: **remove it, do not keep an internal 0.** The shim was `courseIn` (0 to the main id on every write and lookup) and `courseOut` (every read gives the main Course as 0). Keeping it "internally only" would still leak `0` into every `map[plan.Key]…` that the runner, notify facts and the cook adapter build from store reads, which is exactly the bug class C3 exists to remove, and after C2 nothing needs it: the handlers pass real ids, `SlotInfo.Courses` carries real ids, a Meal Slot always serves at least one Course (`courses_empty`).

- `internal/plan/store`: `courseIn`, `courseOut`, `mainCourseSQL` go. Every read gives the real id. A key with `CourseID 0` names nothing: writes fail with `ErrUnknownRef` (the foreign key), `Meal(0-key)` is `ErrNotFound`. Make main changes no key.
- `internal/plan/runner`: `storeKey` and the 0-translation in `courses_c2.go` go (the header comment too); `Runner.MainCourseID` stays (the slot-rule default and the board use it). `SlotView.Meal` / `.Unfilled` go.
- `plan.NormaliseCourses` (stored 0 to the slot's main Course) has no caller left: delete it with its test in `internal/plan/courses_test.go`.
- `internal/notify/facts/facts.go`: the `courseID == 0` fallback and `s.courses.Main` go.
- Pure packages `plan` and `planner`: `Key.CourseID == 0` as "a cell of a slot without Courses" (`CellKeys`, `courseAttendance`, the planner's no-Course-fit branch) stays **as a pure-planning convenience for unit fixtures only**: it cannot reach the store, and no production slot is without Courses. Their comments stop calling it "the transition shim". The runner's own tests use it through `fakeSources` without Courses: the developer gives those fakes a main Course (real id) and the Recipes the main Course (see §7, "hidden cost").

## 4. SPA

Every `courseId` `0` fallback goes; the SPA always holds a real Course id.

| File | Change |
|---|---|
| `plan/api.ts` | `slotPath(key)` needs `key.courseId`; without it the call throws (`A Planned Meal key needs its Course`) before any request. `SlotKey.courseId` becomes required, `slotDayPath` takes a slot-only type for `cookedAll` / `notCookedAll`. |
| `plan/lib/courses.ts` | `slotCourses` returns `slot.courses ?? []`: no Course made up from `meal` / `unfilled`, no `courseId 0`, no `'Main'`. `courseOf(slot, courseId)` has no "main by default". `courseKey` always carries the id. |
| `plan/lib/toConfirm.ts` | `toConfirmCourses` leaves out an entry without `courseId` (never `0`). |
| `plan/lib/couldntGroups.ts` | `courseCells` has no "slot without `courses` is one cell"; the cell id uses the real `courseId`. |
| `plan/lib/hero.ts`, `plan/lib/regenerate.ts` | read the Course rows (`regenerateImpact` counts every Course's unpinned planned meal, not `s.meal` of the main Course). |
| `board/lib/tiles.ts` | `hasPlanned`, `tonightRows`, `tomorrowLine`, `tomorrowSlots` read `courses` only; `tonightRows` has no `courseId: 0, 'Main'` row. |
| `cook/lib/scope.ts` | `scopeOf` is for Recipes (the `'meal'` `CookSource` goes; `cookApi.view` opens a Recipe only); `parseMealScope` reads three-part only; `sameScope(a, b)` has **two** parameters and no main-Course case (string equality after parsing); `cookReheatPath` needs a Course (throws). |
| `cook/lib/reheat.ts`, `cook/lib/timeline.ts`, `cook/hooks/*` | drop `mainCourseId` (parameter of `reheatTimerOfCourse`, `holdingTimersFor`, `useItemGate`; `useCourses().main` in `useReheat` and `useCookTimeline`; the `mainCourseId` field of the hook result and the screen). The signatures keep an **optional** trailing `mainCourseId` in this commit only so the tests typecheck; the developer deletes it and its callers. |
| `cook/screens/TimelineCookScreen.tsx` | `courseKeyOf` always carries `courseId`. |
| `cook/screens/ReheatScreen.tsx`, `cook/index.ts` | the route `/cook/reheat/:date/:slotId` goes; only `/cook/reheat/:date/:slotId/:courseId` stays. |
| `plan/components/TodayTiles.tsx`, `plan/hooks/useCouldntFix.ts` | build the key with the entry's `courseId` (no conditional spread). |
| `plan/types.ts` | `PlanSlot.meal` / `unfilled` stay on the type only because flat entries use it: split the type (`PlanSlot` has `courses`, `PlanEntry` is the flat shape). |

The scan `web/src/crsC3.noCourseless.test.ts` lists the remaining occurrences by file and line; it is the developer's checklist.

## 5. BDD

Steps of E and G changed (granted by the Project Manager): `steps_planning_test.go` (`slotPath` takes the main Course id; timers use the three-part scope; `slotMeal` / `slotUnfilled` read the Course rows), `steps_cook_board_test.go`, `steps_reheat_test.go`, `steps_shopping_scan_test.go`, `steps_reheat_time_test.go`, `steps_crs_b_test.go`, `steps_tg_test.go`, and the new helpers `mainCourseRow`, `slotMeal`, `slotUnfilled`, `mainCourseID` in `steps_common_test.go`. `steps_import_export_test.go`, `steps_recipe_assistant_test.go` and `steps_notify_ops_test.go` needed no change: they do not call a course-less route or scope.

New or changed scenarios: `courses_plan_api.feature` (course-less path 404 and sets nothing; a slot has no `meal` / `unfilled`), `courses_cooked_api.feature` (the removed per-slot paths 404 and mark nothing), `cook_timeline.feature` (two-part path 404; two-part scope `422 invalid_scope` for a timer and a mark), `cook_mode.feature` (the scope of tonight's meal is three-part).

## 6. Not touched, to report

SF-chips owns `MealTile`, `TonightHero`, `PlannedMealSheet`, `CourseRow` (and their tests). C3 **needs** changes there and they merge with SF-chips:

- `MealTile.tsx` (`const meal = slot.meal`, `slot.unfilled` at the unfilled branch) and `TonightHero.tsx` (`const meal = slot.meal`) read the slot alias that §1 removes: they must read `heroRow(slot)` / the Course row.
- `PlannedMealSheet.tsx` has `courseId?: number`; with a required `SlotKey.courseId` it becomes required.
- The tests `MealTile.courses.test.tsx`, `TonightHero.courses.test.tsx`, `PlannedMealSheet.courses.test.tsx` and `BoardTiles.courses.test.tsx` have a "one Course renders the same as a slot without `courses`" guard: the second half goes with the alias.

Order: C3's web part merges after SF-chips, or the Project Manager lets C3's developer make exactly these edits when SF-chips has merged.

## 7. Tests

Red (new), by suite:

- Go: `plan/httpapi/crs_c3_routes_test.go` (old routes 404, change nothing; slots and board carry no `meal` / `unfilled`); `plan/store/courses_test.go` (real id on every read, Course 0 names nothing, Make main changes no key; and every store test whose `f.key()` now names the main Course by its id); `cook/scope_test.go`; `cook/store/scope_c3_test.go`; `cook/service/crs_c3_test.go`; `cook/httpapi/crs_c3_scope_test.go` and the scope tests of `crs_c2_timeline_test.go`; `plan/httpapi/shapes_test.go` (the Course row's meal carries `startBy`).
- BDD: the scenarios of §5 plus the reheat scenarios (scope three-part).
- Web: `crsC3.noCourseless.test.ts`, `plan/api.courses.test.ts`, `plan/lib/courses.test.ts`, `plan/lib/toConfirm.courses.test.ts`, `plan/lib/couldntGroups.courses.test.ts`, `plan/lib/regenerate.test.ts`, `board/lib/tiles.courses.test.ts`, `cook/api.c3.test.ts`, `cook/lib/scope.c3.test.ts`, `cook/lib/scope.courses.test.ts`, `cook/lib/reheat.courses.test.ts`.

Existing tests changed because they pinned an alias (each green before the shim goes unless listed above):

| Test | Reason |
|---|---|
| `plan/httpapi` `TestCookedAndNotCookedOldPathsActOnTheMainCourseOnly` (now `…ActOnTheNamedCourseOnly`) | called the removed per-slot paths; now the Main by its id |
| `plan/httpapi` `TestConfirmAndUnpinActOnOneCourse`, `TestAlternativesRefusals`' sibling, `TestCookPreviewIsThatCoursesProposalAndPortions`, `TestTheCourselessPutIsTheMainCourseAlias` (now `TestPutOnTheMainCourseByItsIDIsOneCell`) | "the old path is the main Course" assertions replaced by the Main's id |
| `plan/httpapi` `TestPlanSlotKeepsMealAndUnfilledAsAliasesForTheMainCourse` (now `TestCourseRowsCarryTheMealAndTheReasonOfEachCourse`); `slotBody` loses `Meal`/`Unfilled`; `path()` always names the Course | pinned `slot.meal` |
| `plan/httpapi/shapes_test.go` (3 tests) | read `slotOut.Meal`; now the Course row |
| `plan/store/courses_test.go`, `store_test.go` helper `key()` | pinned "main reads as 0" and "0 is main" |
| `cook/scope_test.go`, `plan/key_test.go` | pinned `MealScope(…, 0)` two-part and two-part parse |
| `cook/store/shim_test.go` | deleted; replaced by `scope_c3_test.go` |
| `cook/store/store_test.go`, `cook/timer_test.go`, `cook/view_test.go` | `MealScope(…, 0)` became `…, 7` |
| `cook/service/service_test.go` | fake meals carry `CourseID 5`, scopes three-part, `MealView` became `CourseView` |
| `cook/httpapi/crs_c2_timeline_test.go` (`mainScope`, two-part route case) | main scope three-part; the two-part route case moved to `crs_c3_scope_test.go` |
| BDD steps and `cook_mode.feature`, the three features above | see §5 |
| web: `cook/api.test.ts`, `cook/api.timeline.test.ts` | the two-part meal view is gone; scope strings three-part |
| web: `cook/hooks/useReheat.test.tsx`, `useReheat.recipe.test.tsx` | the key carries its Course and the scope is three-part |
| web: `plan/screens/PlanScreen.courses.test.tsx` | "a slot without `courses` keeps the course-less routes" became the Course route |

**Hidden cost, for the Project Manager**: many existing tests build their slots with `slot()` of `plan/test-utils.tsx` (no `courses`, an alias `meal`) and mock the course-less URLs (`PlanScreen.test.tsx`, `plan/hooks/hooks.test.tsx`, `wp6.hooks.test.tsx`, `TodayScreen.hero.test.tsx`, `ReheatScreen*.test.tsx`, `useCookSession.test.tsx`, `CookScreen*.test.tsx` and some `Board` / `MealTile` tests). They are green now and are not edited here: they only pass because of the alias. The developer changes `slot()` / `meal()` to the server shape (one main Course with a real id, no `meal` / `unfilled` on the slot, a `serverSlot`-like builder is in `plan/test-utils.c3.ts`) and rewrites their mocked paths (`/api/plan/2026-11-10/2/cooked` to `…/2/1/cooked`, two-part scope literals to three-part). Same for `internal/plan/runner` (`fakes_test.go` plans slots without Courses) and `internal/notify/facts/facts_test.go`. Mechanical, but wide; `plan/test-utils.tsx` is shared with SF-chips, so coordinate the merge.
