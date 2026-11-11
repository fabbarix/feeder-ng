# CRS team C2: plan, cook, Today and board API per Course (design note for the Developer)

Step 1 of the pipeline (designer / test author) for team C2 of [crs-plan.md](crs-plan.md) (part 2 of the API), branch `team/crs-c2` from main `cd39ff1` (A, B, C1 and K are merged). Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §7.5, §8, §9, §11, §12, §16. Related: [crs-b.md](crs-b.md) (runner, `Alternative.Relaxed`), [crs-k.md](crs-k.md) (`cook.Timeline`), [crs-c1.md](crs-c1.md) (Course payloads carry the real main Course id).

The tests are red on purpose and only the new ones fail (one guard is green, §7). Handlers stay thin (parse, call, respond): the rules live in the runner, `internal/cook` and the cook service.

## 1. Scope

In: every plan, cook, Today and board handler of §16 for Courses. Per-Course plan views, Set / Confirm / Unpin / Swap / Cook preview / Cooked / Not cooked per Course, the slot-wide `…/all/cooked` and `…/all/not-cooked`, the Course on the lists (to-confirm, couldn't plan, leftovers), Slot Rules with a Course, the cooking timeline route, the single-Course route, the board payload, Today's Advance Steps, events. The old course-less plan and cook routes stay as aliases for the main Course until C3.

Not in: C3 (alias removal, `404` on the old per-slot paths, `400 invalid_scope` for two-part scopes), C-RX (`GET /api/plan/couldnt-plan/exclusions`), the web, GLOSSARY, CHANGELOG, the spec, the store packages.

What this commit adds besides tests: stubs only. `internal/plan/runner/courses_c2.go` (types and three methods that return `ErrNotImplemented`), the new routes in `internal/plan/httpapi/httpapi.go` and `internal/cook/httpapi/httpapi.go` answering `501 not_implemented`, and the shared fixture package `internal/testkit/crsc2` (a household with a Monday Dinner serving Main and Side; used by the plan, cook and Today tests).

## 2. The rule for Course ids

**The API never shows the transition shim's `0`.** The plan store reads the main Course as `0` and every other Course as its real id (crs-plan §2.2, shim 1). Every JSON that names a Course (`courseId`, `fromCourseId`, `coveredBy.courseId`, `covered`, rule `courseId`, `plannedFor[].courseId`, cook `meal.courseId`, `nextAdvance.courseId`, advance-step `courseId`) carries the **real** id. One lookup does it: `Runner.MainCourseID(ctx)` (stub) and a helper `realKey(plan.Key) plan.Key` in the runner, applied to every `plan.Meal`, `Unfilled`, `Leftover`, `SlotRule` the runner returns. On the way in, a route with `{courseId}` passes the id as given (the store accepts the real main id and `0` for the same cell), and the course-less aliases pass `0`.

The scope string is the one exception, on purpose: until C3 the main Course's scope keeps the **two-part** form (`meal:<date>/<slotId>`), because the cook store writes it that way on read so that the old SPA's string comparison keeps working (crs-plan §2.2, shim 2). Every other Course is three-part. The tests pin this (`mainScope`/`sideScope`), and C3 flips it.

## 3. Plan routes

### 3.1 `GET /api/plan` (and the board's slots)

`slotOut` keeps its fields and gains:

| Field | Meaning |
|---|---|
| `courses` | `[{courseId, name, main, optional, optOutMemberIds, meal, unfilled, coveredBy, unserved}]` in the slot's order, then **history rows** (below). `optOutMemberIds` is `[]`, never `null`, and is the effective list on that date (the date's own list replaces the usual one, an empty date list puts everybody back). |
| `cookMinutes` | The slot's timeline total in whole minutes (§5.3), `null` when no fresh Course is still to cook (all resolved, or only Leftover Courses). |
| `startBy` | `"HH:MM"`, household zone, slot time minus `cookMinutes`; omitted with `cookMinutes: null`. (Additive; the hero's "start 18:45", spec §7.5.) |
| `meal`, `unfilled` | **Aliases of the main Course's** `meal` and `unfilled` until C3 (crs-plan §2.2). `meal.startBy`/`meal.cookMinutes` keep meaning that Recipe's own time. |
| `rules[]` | Each rule gains `courseId`. |

`mealOut` gains `courseId`, `courseName`, `wholeMeal`, `relaxed`. `portions` is what was stored for the Course (the planner already used the Course Attendance). `why` carries `cooldown_relaxed` (`date`, `recipeId`, plus the Recipe name) and `variety_relaxed` (`tag`, `value` or `date`) as the planner stored them; nothing to translate.

**The four states of a Course row** (at most one is set; derived from the stored rows, the Meal Slot's Courses and the Course Attendance, no new table):

1. `meal` (any state, also beside a Whole meal, also in an optional Course): the other three are `null`.
2. `unfilled` (a stored reason, now also `no_course_recipes`; `eliminated` keeps `coolDown` and `varietyRule`).
3. otherwise, in this precedence: `unserved: "no_course_attendance"` (the slot has attendees and every one opts out of this Course on that date), then `coveredBy {courseId, recipeId, recipeName}` (the main Course's Planned Meal, any state, is a Whole meal and this Course is not the main one), then `unserved: "optional"` (the Course is optional). The precedence is the planner's pre-walk order (crs-b §2).
4. all `null`: a date the planner has not (yet) planned, or past.

**History rows.** A Planned Meal in a Course the slot no longer serves is listed after the slot's Courses **only when it is Cooked or Not cooked**: `{courseId, name, main: false, optional: false, optOutMemberIds: [], meal}`. (A still planned one leaves with the Course; the store deletes it.)

`ToConfirm` and `CouldntPlan` return **one entry per Course**, flat: the old slot fields (`date`, `mealSlotId`, `name`, `time`, `at`, `portions`, `attendance`, `rules`) plus `courseId`, `courseName`, `meal` (to-confirm) or `unfilled` (couldn't plan). Covered and unserved Courses never appear. Order: date, slot time, then the slot's Course order. Key stays `slots`. `GET /api/plan/leftovers` entries gain `fromCourseId`; the Cooked answer's `leftover` has it too, and `plannedFor[]` gains `courseId`.

### 3.2 Course routes

| Route | Behaviour |
|---|---|
| `PUT /api/plan/{date}/{slotId}/{courseId}` | Sets and Pins. Answers the `mealOut` plus **`covered: [courseId…]`** (always present, `[]` when nothing is covered): the Courses whose unpinned, unresolved Planned Meals a Whole meal in the main Course removed. |
| `POST …/{courseId}/confirm`, `/unpin` | The `mealOut`. |
| `GET …/{courseId}/alternatives` | `alternativeOut` gains `wholeMeal`, `covers` (names of the slot's other Courses the Recipe would cover, `[]` not `null`; only for a Whole meal offered to the main Course) and `relaxed`. Strict first, relaxed last (the runner already orders them). |
| `GET …/{courseId}/cook` | The Mark as Cooked sheet of that Course: `portionsNeeded` is the Course Attendance's, `meal.courseId`. |
| `POST …/{courseId}/cooked` | As today for that Course. Stock, Leftover (`fromCourseId`) and the Reheat/Cooked timers are that Course's. |
| `POST …/{courseId}/not-cooked` | As today for that Course. |

**Error order and codes** (the first that applies): `404 unknown_slot` (no such Meal Slot on that weekday, or `{courseId}` not a number), `422 in_past` (PUT only), `422 course_not_in_slot` (PUT; the id is unknown or the slot does not serve it; `GET …/alternatives` too, and the new `ErrCourseNotInSlot`), `422 unknown_recipe`, `422 recipe_archived`, `422 recipe_not_in_course`, `409 recipe_in_slot`, `422 validation_failed` (`batches`), `409 already_resolved`. The other actions on a Course that holds no Planned Meal are `404 not_found`, as before. `409 not_swappable` and `409 future_meal` are unchanged.

### 3.3 Slot-wide routes (new paths on purpose)

`{slotId}/all` is a literal segment, so the mux prefers it over `{courseId}`.

**`POST /api/plan/{date}/{slotId}/all/not-cooked`** (no body). Marks every unresolved Course of the slot Not cooked in **one transaction** (`runner.NotCookedAll`), cancels the timers of each, publishes one `plan` event (`reason: not_cooked`). Answer `{ "meals": [mealOut…] }`: the Courses that changed, in the slot's order (Cooked and already skipped ones are not in it and stay as they are). Errors: `404 unknown_slot`, `404 not_found` (the slot has no Planned Meal that day), `409 future_meal`, `409 already_resolved` (nothing unresolved).

**`POST /api/plan/{date}/{slotId}/all/cooked`** body `{ "courses": [{ "courseId", "leftoverPortions"? }] }` (the whole body and `leftoverPortions` are optional). Marks **every unresolved Course of the slot** Cooked (`runner.CookedAll`), all or nothing, in one transaction: one Stock deduction (summed, one `stock` event after the commit), one `plan` event (`reason: leftovers_changed`), the timers of each Course cancelled, and `leftoverPortions` per listed Course (a Course not listed uses its proposal; a Leftover Course has no Leftover to record). Answer `{ "meals": [mealOut…], "leftovers": [leftoverOut…], "warnings": [warningOut…], "plannedFor": [plannedForOut…] }` (meals in the slot's order; `leftovers` only for the Courses that recorded one). Errors: the same four as above, `422 course_not_in_slot` (`field: courses[i].courseId`) for a listed Course the slot does not serve, `409 already_resolved` for a listed Course that is Cooked or skipped, `422 validation_failed` with `field: courses[i].leftoverPortions` for a bad count (nothing is written, nothing published).

**The old per-slot paths** `POST …/{slotId}/cooked` and `…/not-cooked` are aliases for the **main Course only** and never take the whole-slot meaning (their answers are the single-Course shapes, with the real main `courseId`). The same holds for every other course-less plan route (`PUT`, `confirm`, `unpin`, `alternatives`, `cook`).

### 3.4 Slot Rules

`GET/POST /api/slot-rules`: a rule has `courseId` (real id). POST defaults it to the main Course. `422 course_not_in_slot` (not a Course of that slot, unknown ids included) and `422 recipe_not_in_course` (a Recipe rule whose Recipe is not marked with the Course; a Tag rule has no Course fit to check). `409 duplicate_rule` is per Course. The plan view's `rules[]` carry `courseId` too.

### 3.5 Events

No new topic. Every write publishes `plan {"changed":"plan","reason":…}` after its commit, one per write: `pinned`, `unpinned`, `leftovers_changed` (Cooked, Mark all Cooked), `not_cooked` (both), `rules_changed`. A refused or rolled-back write publishes nothing. Cooked and Mark all Cooked also publish the `stock` event the Stock adapter publishes (once per request).

## 4. Runner changes (granted to C2: the view code)

- `SlotView` gains `Courses []CourseView` and `CookMinutes *int` (stubbed in `courses_c2.go`/`actions.go`). `View(ctx, from, to)` fills `Courses` per slot occurrence from `Source.SlotCourses` (order, `Main`, `Optional`, Course Attendance, so `OptOutMemberIDs` = slot attendees not in the Course Attendance, from the same call), the stored meals and reasons keyed by `realKey`, and the Whole-meal cover read from `Source.Recipes` (`planner.Recipe.WholeMeal`). `SlotView.Meal`/`Unfilled` stay and are the main Course's (the aliases).
- `ToConfirm` and `CouldntPlan` return one `SlotView` **per Course entry** instead of per slot (`Key.CourseID` real, `Meal`/`Unfilled` that Course's). Add a `CourseName` to `SlotView` (or return `CourseView` next to it); the handler adds `courseId` and `courseName`.
- New: `MainCourseID`, `NotCookedAll`, `CookedAll`, `ErrCourseNotInSlot`, `ErrRecipeNotInCourse`, `ErrRecipeInSlot` (stubs). `SetMeal` checks Course fit and the one-Recipe-per-slot rule and returns which Courses a Whole meal removed (extend its result, or add `SetMealResult`); `Alternative` gains `WholeMeal` and `Covers`. `CookedAll` and `NotCookedAll` reuse the body of `Cooked`/`NotCooked` inside one `write` (and one `afterPlan`), and call `OnResolved` for each key after the commit.
- `Deps.OnResolved` cancels `cook.MealScope(key.Date, key.MealSlotID, key.CourseID)`; with the real main id the three-part scope reaches the cook store, which maps it (shim 2). A test covers it (`TestCookedMarksOneCourse…`).

## 5. Cook routes

### 5.1 `GET /api/cook/meals/{date}/{slotId}/all` (the timeline)

Built in the cook service (`internal/cook/service`): read the slot's Planned Meals with their Course (extend `MealInfo` with `CourseID`, `CourseName`, `Fresh`, `Portions`, `Position`; `Meals.Meal` takes the Course; add `Meals.Slot(ctx, date, slotID)` returning the slot's meals in the slot's Course order), then:

- Input to `cook.Timeline`: the **unresolved** Courses in slot order. A fresh Course (`Batches > 0`) gets `Steps` from `Recipes.Steps`; a Leftover Course (`From` set) gets `Reheat: true` and `ReheatSeconds = cook.DefaultReheatSeconds(portions, recipe.ReheatMinutes)`. **Do not write a new Reheat length** (spec §8, `internal/cook/reheat.go`).
- **Advance Steps** come from `schedule.Compute` (its `Advance` list per fresh Course), not from a second scan of the Steps; they are listed per Course in slot order, then Step index, with that Course's marks.
- **Rounding.** `cook.Timeline` works in seconds. `totalMinutes = ceil(TotalSeconds / 60)`, `startAt = slot instant − totalMinutes`, and when `TotalSeconds` is not a whole number of minutes every item's `startSeconds` and `endSeconds` get `+ (totalMinutes*60 − TotalSeconds)`, so they count from `startAt` and the last item ends at the slot time. (The API fixtures only produce whole minutes, because Steps and the Reheat default are whole minutes; the Developer adds a unit test of the offset on the service's pure part.)
- **`kind`**: `ItemStep` → the Step's `schedule.Kind` as `"active"` or `"passive"`; `ItemReheat` → `"reheat"`; `ItemServe` → `"serve"`. `step` is the Recipe Step index, `null` for Reheat and Serve. `number` is the 1-based position in `items`. `durationMinutes`: the Step's, the Reheat length rounded up, `0` for Serve.
- **`text`**: the Step's text; Reheat `"Reheat <Recipe>"`; Serve `"<Recipe>: ready to serve"` (spec §11). `uses`: scaled by that Course's Batches (`schedule.ScaleUses`), `[]` for Reheat and Serve. `after`: Recipe Step indexes, `[]` never `null`. `imageUrl` as the single view.
- **`timer`**: Passive Step items `{label, durationSeconds}`; the **label names the Recipe when the timeline has more than one Course**: `"<Recipe> · <step text cut to 30 runes>"` (spec example "Green beans · Simmer"); with one Course it is `cook.TimerLabel(number-in-the-Recipe, text)` exactly as the single-Course view. Reheat items carry `{label: "Reheat", durationSeconds}`: the free timer the Reheat screen starts, in the Course's scope. Active and Serve items: `null`.
- **`courses`**: every Course of that slot and date with a Planned Meal, in slot order: `{courseId, name, recipeId, recipeName, scope, batches, fresh, state, reheatSeconds?}`; `reheatSeconds` only for unresolved Leftover Courses. Resolved Courses are listed with their state and contribute no items.
- Errors: `404 not_found` (bad date, unknown slot, no Planned Meal in the slot that day), `409 not_cookable` when no Course is unresolved. Only Leftover Courses left is a `200` with Reheat items (the SPA decides to open Reheat).
- Arrays (`courses`, `advance`, `items`, `uses`, `after`) are `[]`, never `null`.

### 5.2 `GET /api/cook/meals/{date}/{slotId}/{courseId}` and the two-part alias

The single-Course view of today, for one Course: same `viewDTO`; `meal` gains `courseId` and `courseName`; no `otherCourses`. `scope` per §2. Errors as today (`404 not_found` including a Course id that is not a number or holds no meal, `409 not_cookable` for a Cooked, skipped or Leftover-served Course). The two-part `GET /api/cook/meals/{date}/{slotId}` is the main Course's single view, never the timeline; it must not grow `items`.

### 5.3 Scopes, timers and marks

`MealInfo` and `scopeSteps` resolve a meal scope **with its Course**: `meal:<d>/<s>/<c>` is that Course's Planned Meal and Recipe (`c` the real main id included), `meal:<d>/<s>` is the main Course's. So `POST /api/cook/timers {scope, step}` takes the Step's label and duration from that Course's Recipe, `GET /api/cook/timers?scope=` names that Course's Recipe, and `PUT /api/cook/marks` checks the Advance Step against it. (Today `scopeSteps` looks the meal up by date and slot only; with two Courses it would pick one of them.) `cookMinutes` on the plan is the same `cook.Timeline` total (`service.CookMinutes(ctx, meals)`, shared by the plan handler; the timeline view uses it too).

### 5.4 The board

`GET /api/board` gains `slots`: today's and tomorrow's slots, chronological, in the **same shape as `GET /api/plan`** (`courses`, `cookMinutes`, …), so the tonight and tomorrow tiles need no second request (spec §16: "the board and Today's tiles carry the same `courses` list and `cookMinutes` per slot"). `nextAdvance` gains `courseId` and `courseName`, its `scope` is that Course's (§2), and `nextAdvance` is computed per Course. Wiring is the Developer's call: the cleanest is one function in `internal/plan/httpapi` (`SlotsJSON(ctx, from, to)`) used by both handlers, or the board handler asking the runner through a small interface; the tests are black-box.

### 5.5 Today

`GET /api/today/advance-steps` entries gain `courseId` and `courseName` (the Course of that Planned Meal). **This needs `notify.StepDue` to carry the Course** (`internal/notify/compute.go`, one field filled from `MealFact.CourseID`, which exists) and the dispatcher facts to name the Course. `internal/notify` is team G's; see gap 2.

## 6. Tests (red) and where they live

| Area | File | What it pins |
|---|---|---|
| Plan view | `internal/plan/httpapi/crs_c2_view_test.go` | `courses` in slot order, real ids; `meal`/`unfilled` as main aliases; `relaxed`, `wholeMeal`, chips; `coveredBy`, a Course beside a Whole meal; `unserved` and its precedence; effective `optOutMemberIds` (usual, date override, empty override); history rows; `cookMinutes`/`startBy` (30 for 20 + 10 Active, Cooked leaves, Leftover only is null, Reheat overlaps); Slot Rules with `courseId` and their refusals |
| Set, Swap | `…/crs_c2_set_test.go` | PUT per Course, every refusal, Whole meal `covered` and what it removes (Cooked and Pinned stay), course-less alias, confirm/unpin, alternatives (Side only, strict then relaxed with the `cooldown_relaxed` chip last, `covers`, refusals), cook preview with the Course's portions |
| Cooked | `…/crs_c2_cooked_test.go` | Cooked per Course (Stock, Leftover `fromCourseId`, timers of that Course only, `plannedFor.courseId`), old paths = main only, refusals, `all/cooked` (one deduction, one `leftovers_changed`, one `stock` event, timers cancelled, proposal default, all or nothing with `courses[1].leftoverPortions`), `all/not-cooked`, whole-slot refusals, to-confirm and couldn't plan per Course |
| Cook | `internal/cook/httpapi/crs_c2_timeline_test.go` | the timeline (30 min for 20 + 10 Active, order and seconds, `uses` scaled by that Course's Batches, tie order, Recipe-named timer label vs the plain one, Reheat 180 s and the Recipe's own Reheat time, Serve item, resolved Courses without items, `409 not_cookable`, refusals), Advance Steps per Course and marks, the single-Course view, the two-part alias, timers and marks by Course scope |
| Board | `…/crs_c2_board_test.go` | `nextAdvance.courseId`/scope, `slots` for today and tomorrow only |
| Today | `internal/today/httpapi/crs_c2_test.go` | `courseId`/`courseName` on Advance Steps |
| BDD | `bdd/features/planning/courses_plan_api.feature`, `courses_cooked_api.feature`, `bdd/features/cook-board/cook_timeline.feature` (tag `@crs-c2`), `bdd/steps_crs_c2_test.go` | the same rows as scenarios. Run just these with `GODOG_TAGS=@crs-c2 go test ./bdd -run TestFeatures`. |

Fixtures: `internal/testkit/crsc2` builds the household in the database (no events, the planner stays quiet), makes Recipes through the API, then `Settle()` waits for the planner and clears the plan; each test writes the Planned Meals it needs as rows. A write route (PUT, Cooked) does replan, so those tests assert on the cells they touch.

Two tests are green today on purpose, as guards: the BDD scenario "The old per-slot Not cooked path skips the main Course only" (already true) and, inside the red tests, the parts of the old routes that already work.

## 7. Gaps and decisions for the spec / plan

1. **The board has no slots today** (`useBoard` reads `/api/plan`). §16 says the board payload "carries the same `courses` list and `cookMinutes` per slot"; read as: `slots` for today and tomorrow in the plan's shape (§5.4). The PM may prefer to leave the board on `/api/plan` and drop `slots`; then only `nextAdvance` changes.
2. **`GET /api/today/advance-steps` needs `notify.StepDue.CourseID`** (a one-field change in `internal/notify`, team G's). The PM must grant it to C2 or ask G1 to add it; the test (`internal/today/httpapi`) stays red until then.
3. **`covered` on PUT is always present** (`[]` when empty); §16 only shows it for a Whole meal. **`courseName` on Advance Steps** and `nextAdvance` is added next to `courseId`.
4. **Shapes §16 leaves open**: the answers of `all/cooked` and `all/not-cooked` (§3.3), the flat per-Course entries of `to-confirm` and `couldnt-plan` (§3.1), history rows (§3.1), the order of the error codes (§3.2). Which Courses `all/cooked` cooks when `courses` lists only some: all unresolved ones (§3.3).
5. **Scopes of the main Course stay two-part** in every cook payload until C3, while §16 says three-part. Tests pin the transitional form with a comment.
6. **`cookMinutes` is null with only Leftover Courses**, although a Reheat is a timeline of its own; "nothing is fresh" in §16 is read literally. `startBy` is an addition (§3.1).
7. **`course_not_in_slot` on `GET …/alternatives`** (422) but `not_found` (404) for the other actions on a Course with no Planned Meal. §16 names the code for PUT only.
8. **Timer labels** (§5.1) and the texts of Reheat and Serve items are ours; the spec gives the example "Green beans · Simmer" and "Tiramisu: ready to serve" only. The Reheat item's `timer` is the Reheat screen's free timer so the two never run twice (§11).
9. **Unserved precedence** (§3.1) follows the planner's pre-walk; the spec lists the three states without an order.
10. **The rounding offset** cannot be hit through the API (Steps and Reheat are whole minutes), so it is a unit test for the Developer.
11. **Row-level fixtures**: the Planned Meal rows the tests write bypass the planner's own invariants (for example a cooked row on a date whose weekday has no slot, used as Cool-down history). The planner tolerates them (B's history).
12. **The worktree** `/opt/mrwho/Projects/feeder-ng.worktrees/crs-c2` and its branch disappeared while this note was being written (not by this agent); both were recreated from `cd39ff1`.
