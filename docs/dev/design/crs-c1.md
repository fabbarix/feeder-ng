# CRS team C1: Courses, Recipe and Meal Slot API (design note)

Step 1 of the pipeline (designer / test author) for team C1 of [crs-plan.md](crs-plan.md) (part 1 of the API). Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §3.1, §4, §16. Branch `team/crs-c1`, from main `e87d71d` (team A is merged; the stores are real). Store APIs: [crs-a.md](crs-a.md) §3.

The tests are red on purpose and only the new ones fail. Handlers are thin (parse, call the store, respond); the stores already do the work, so C1 is routes, shapes, error mapping and events.

## 1. Scope

In: the Courses routes, `courseIds` and `wholeMeal` on the Recipe routes, `courses` on the Meal Slot routes (single and batch, with `dryRun` and `removes`), `courses` on Date Attendance, the events, the module wiring.

Not in: plan, cook, today and board handlers (C2), alias removal (C3), RX routes (C-RX), Recipe File (E1), web, GLOSSARY, CHANGELOG, the spec, the stores.

What this commit adds outside tests: `internal/course/httpapi/httpapi.go` (a stub module with no routes, so the new tests get `404` instead of a compile error) and `internal/modules/courses.go` (its blank import, as every module has). The developer fills in `mount`.

## 2. Files for the developer

| Area | Files | Work |
|---|---|---|
| Courses | `internal/course/httpapi/{httpapi,handlers,shapes}.go` | `mount` (`r.User` for the two GETs, `r.Admin` for the rest), `courseOut`, `impactOut`, error mapping (§3.1). Needs `internal/course/store`, `internal/recipe/store` (Recipe names for `impact`) and `internal/household/store` (Meal Slot names). |
| Meal Slots and Date Attendance | `internal/household/httpapi/{httpapi,meals,courses}.go` | `courses` on `slotBody` and `slotIn`; `set.courses` and `dryRun` on `batchIn`; `removes`; `courses` on the date body and `PUT`; `writeErr` gains `field`, `reason`, `ErrCourseNotInSlot`. |
| Recipes | `internal/recipe/httpapi/httpapi.go` | `courseIds`, `wholeMeal`, `courses` on the bodies, `courseIds` and `wholeMeal` on `summaryJSON`, `?course=` and `?notCourse=`. |

## 3. Decisions

### 3.1 Courses (`internal/course/httpapi`)

Shapes are exactly §16. A single-Course answer (`POST`, `PATCH`, `archive`, `unarchive`) is the list row: the handler re-reads `List(archived)` and picks the Course, so the counts are there. `GET /api/courses` answers `{ "courses": [...] }`. `position` is the stored 0-based position; only its order is meant.

| Store error | Answer |
|---|---|
| `course.ErrNotFound` (also a non-numeric `{id}`) | `404 not_found` |
| `ErrNameInvalid` | `422 validation_failed`, `field: name` |
| `ErrNameTaken` | `409 course_name_taken`; when the clashing key belongs to an **archived** Course the error also carries `"archivedCourseId"` and the message says to unarchive it (PM decision). The handler finds it in `List(true)` by `course.NameKey`. |
| `ErrTooMany` | `422 too_many_courses` |
| `ErrMain` / `ErrLast` / `ErrPlanned` | `409 course_main` / `course_last` / `course_planned` |
| `ErrReplacement`, or `replacement` not a number | `422 validation_failed`, `field: replacement`, `reason: replacement_invalid` (Delete: the query; Archive: the body's `replacementId`, same field name so the dialog has one place to look) |
| `ErrOrder`, or no `ids` | `422 validation_failed`, `field: ids` |
| `main: false` or `main: true` on an archived Course (`ErrArchived`) | `422 validation_failed`, `field: main` |
| `PATCH {}` | `422 validation_failed`, `field: name`, `reason: nothing_to_change` |

- `PATCH` with `name` and `main` is one step: validate the body, then rename (a taken name stops here), then `MakeMain`. `main: true` on the main Course is a `200` no-op. Renaming an archived Course is allowed.
- `PUT /api/courses/order` lists the **active** Courses once each (crs-a gap 7). Archived ones stay after them.
- `GET /api/courses/{id}/impact` is `course.Impact` as §16: `plannedMeals` (`date`, `mealSlotId`, `mealSlotName`, `recipeId`, `recipeName`, `pinned`; the store's order, date then slot) and `slotRules` (`id`, `mealSlotId`, `recipeId`, `recipeName`, `tag`; omitted fields as `ruleOut` omits them). Both lists are `[]`, never `null`. §16 does not define `ruleOut` for these two uses (gap 6).
- `DELETE` answers `204` and `Archive` `200`; both use the store's single transaction. A Course that was never planned is gone for good on Delete; Archive keeps it.

### 3.2 Meal Slots (`internal/household/httpapi`)

- `slotBody.courses`: `[{ id, name, main, optional, optOutMemberIds }]` in the slot's order; `optOutMemberIds` is `[]`, never `null`. It is on every slot answer (list, create, update, batch `updated`).
- `POST` and `PATCH` take `courses: [{ id, optional?, optOutMemberIds? }]`. Absent or `null` is `nil` for the store (create: the main Course; update: unchanged). A listed Course with an absent or `null` `optOutMemberIds` is `nil` (keeps the stored opt-outs); `[]` clears them. This is Go's own decoding of `[]int64` and needs no special case.
- Validation is `household.ValidateSlotCourses` before the store; the store adds `course_unknown` and `member_unknown`. All are `422 validation_failed` with `field` and `reason` (`field: courses`; `courses[i].optOutMemberIds` for a Member). **`writeErr` today drops `Field` and `Reason`; it now sends both for every `ValidationError`** (additive; existing tests only read the message).
- A single-slot `PATCH` does **not** answer `removes` (PM decision). The SPA previews through a one-weekday batch with `dryRun`.
- Event: `household {"changed":"mealSlots"}` after commit, as today (it replans: `plan.ReasonForEvent`). A `dryRun` publishes nothing.

### 3.3 Batch, `dryRun` and `removes`

`PATCH /api/meal-slots/batch` takes `dryRun` next to `match`, `weekdays` and `set` (`set.courses` has the single-slot shape). The answer is `{ match, updated, skipped, removes }`. **`removes` is always present**, with two lists that are `[]` when nothing goes (so a time-only batch has it too). `updated` of a dry run is the result the save would give, `courses` included (`BatchResult.Updated` already is).

```json
"removes": {
  "plannedMeals": [{ "date", "mealSlotId", "mealSlotName", "courseId", "courseName", "recipeId", "recipeName", "pinned" }],
  "slotRules":    [{ "id", "mealSlotId", "mealSlotName", "courseId", "courseName", "recipeId", "recipeName", "tag" }]
}
```

- **Real ids.** `household.RemovedMeal.CourseID` and `RemovedRule.CourseID` are real Course ids (the household store reads them straight from the tables), and the API sends them as they are: the main Course is its real id, **never `0`**. The plan store's `CourseID == 0` shim stays inside the plan store and its handlers (C2); a payload that ships before C3 must not leak it, because the SPA would then see the main Course as `0` here and as an id in `GET /api/courses`. C2 should do the same for the plan routes (see gap 8).
- **Pinned first.** `plannedMeals` is sorted Pinned first, then by date, Meal Slot id and Course id (the dialog lists the Pinned ones before saving, spec §3.1). `slotRules` by id.
- Names are read at request time (Recipe, Meal Slot and Course names). `recipeName` may be empty only for a Recipe that no longer exists; `tag` is set instead of `recipeId` for a rule by Tag.
- A dry run validates exactly as the save does (`courses_all_optional`, `course_unknown`, `member_unknown`, `no_matching_slot`).

### 3.4 Date Attendance

`GET` gains `courses: [{ courseId, name, optOutMemberIds, isOverride, attendance, portionsNeeded }]` in the slot's order, from `Store.CoursesOn`. `attendance` has the same shape as the top-level one; `portionsNeeded` is `household.PortionsNeeded` over it. It is there for every slot, one Course included.

`PUT` takes `attendance` and/or `courses: [{ courseId, optOutMemberIds: [...] | null }]`:

- `attendance` absent or `null`: the slot's date Attendance is **not** touched (`§16`). A list (empty included) is today's behaviour.
- `optOutMemberIds`: a list (empty = everyone eats it) sets that Course's opt-outs for the date; `null` **or absent** drops them (back to usual). A Course not named is unchanged. Repeated Members are dropped.
- Neither `attendance` nor `courses`: `422 validation_failed`, `field: attendance`, `reason: nothing_to_change`. (Before, `{}` silently meant "nobody"; the web client always sends `attendance`.)
- **Validate everything, then write.** The handler checks every `courses[i]` against `CoursesOn` (the Course is on the slot) and the Members against `Members()` before the first write, so a bad second entry leaves the first and the Attendance unwritten. Then `SetDateAttendance` (if sent), then `SetDateCourseOptOuts` per entry. The date check (`weekday_mismatch`) and the slot `404` run first, as now.
- Errors: `422 validation_failed`, `field: courses[i].courseId`, `reason: course_not_in_slot` (an unknown Course id is the same); `field: courses[i].optOutMemberIds`, `reason: member_unknown`. The existing `unknown_member` for the top-level `attendance` stays as it is.
- `DELETE` drops the date's Course opt-outs too (the store does). Both publish `household {"changed":"attendance"}`.

### 3.5 Recipes (`internal/recipe/httpapi`)

- Bodies take `courseIds` (`[]int64`; absent or `null` is `nil`, `[]` is `courses_empty`) and `wholeMeal` (`*bool`; absent or `null` is `nil`: create gets `DefaultWholeMeal`, update keeps the stored value).
- `recipeJSON` gains `courses: [{ id, name }]` (household order) and `wholeMeal`. `summaryJSON` gains `courseIds` (household order, `[]` never `null`) and `wholeMeal`: §16 does not say, but the Recipes list needs both for the Course chips and the Whole meal chip without one request per Recipe (gap 1).
- Validation errors are the store's: `422 validation_failed`, `field: courses`, `reason: courses_empty` or `course_unknown` (the existing `writeErr` already sends `ve.Code` as `reason`). The request field is `courseIds`; the error names `courses`, as the store and the Meal Slot routes do.
- `GET /api/recipes?course=<id>&notCourse=<id>` (either or both): a value that is not a positive integer is `422 validation_failed`, `field: course` (or `notCourse`), `reason: course_invalid`. An unknown id lists nothing.
- Losing a Course (rules, unresolved unpinned meals) is done by the store in the update's transaction. The handler's existing `recipes` event replans.

### 3.6 Events

All after commit, on topic `household` with `{"changed": ...}` unless noted. `plan.ReasonForEvent` maps `mealSlots` and `attendance` (and any `recipes` event) to a replan, and does **not** know `courses` (`internal/plan/plan.go` is B's). So that the horizon is replanned today, a Course change that affects planning also publishes the existing events:

| Route | Events |
|---|---|
| `POST /api/courses`, rename, `PUT …/order`, `unarchive` | `courses` |
| Make main (`PATCH main: true` that moved the flag) | `courses`, `mealSlots` (the walk order changes) |
| `DELETE`, `archive` | `courses`, `mealSlots`, and on topic `recipes` `{"changed":"courses"}` (Recipes and Meal Slots changed, unresolved meals went) |
| Meal Slot create, update, delete, batch (not `dryRun`) | `mealSlots`, as today |
| Date Attendance `PUT` (attendance, courses or both) and `DELETE` | `attendance` |
| Recipe create, update | `recipes {"id": n}`, as today |

`courses` first, then the rest. The runner coalesces invalidations; one `courses` mapping in `ReasonForEvent` would let a later change drop the extra events (gap 7).

## 4. Tests (red) and where they live

| Area | File | What it pins |
|---|---|---|
| Courses | `internal/course/httpapi/courses_test.go` | 401/403 for every route; list order, counts, `planned`, `?archived=1`; add (trim, collapse, key, 20, accents, archived name reuse with the hint); rename keeps id, flag and references; Make main in one step, `main:false`, archived, empty PATCH, name+main atomic; reorder (permutations, archived stay after); events |
| Courses | `internal/course/httpapi/remove_test.go` | impact counts, Pinned flag, names, rules, empty lists; delete (replacement only where needed, owners only, history rules, `course_main`, `course_planned`, every `replacement` refusal, nothing changes on refusal); archive (takes the Course off Recipes, slots and rules, drops unresolved meals from today incl. Pinned, keeps history, `?archived=1`); unarchive (last, restores nothing, `too_many_courses`); events |
| Meal Slots | `internal/household/httpapi/slots_courses_test.go` | default main Course, order/optional/opt-outs round trip, every validation `reason` and `field`, duplicates dropped, opt-out of a non-attendee kept, update without `courses`, reorder keeps opt-outs, `[]` clears, taking a Course off drops opt-outs and meals but no `removes`, event |
| Batch | `internal/household/httpapi/slots_batch_courses_test.go` | `set.courses` on every Matching slot, non-attendee ignored, kept opt-outs, all-or-nothing validation, `dryRun` (removes, names, Pinned first, nothing written, no event), real save answers `removes` with one event, real main id, `removes` always present, dry run refusals |
| Date Attendance | `internal/household/httpapi/attendance_courses_test.go` | GET shape and portions, PUT courses-only leaves the slot's Attendance, `[]`/`null`, follows the date's Attendance, PUT attendance-only keeps Course opt-outs, DELETE drops them, every refusal, all-or-nothing, event |
| Recipes | `internal/recipe/httpapi/courses_test.go` | defaults, household order, Ready Meal Whole meal default, validation, update keeps/changes, summaries and filters, a lost Course's rules and meals |
| BDD | `bdd/features/courses/{courses,meal_slot_courses,course_attendance,recipe_courses}.feature` (tag `@crs-c1`), `bdd/steps_crs_c1_test.go` | the same rows as scenarios, including the two scenarios of crs-a §6 (reorder keeps opt-outs; taking Side off). Run just these with `GODOG_TAGS=@crs-c1 go test ./bdd -run TestFeatures`. |

Fixtures that are not under test (Recipes, Meal Slots, Planned Meals, Slot Rules) are written straight to the database, so a red test points at C1's routes. The current planner only fills the main Course, so these tests use Side meals and assert on them; where a Main cell could be touched by it they check "contains", not equality.

Two tests are green today on purpose, as guards: `TestSavingACourseListPublishesAMealSlotsEvent` (the existing event) and the BDD scenario "Only the Admin edits a Meal Slot's Courses" (the existing `403`).

## 5. Gaps and decisions for the spec / plan

1. **Recipe list summaries.** §16 gives `courses` and `wholeMeal` to "a Recipe" only. Summaries carry `courseIds` and `wholeMeal` here (above). Needs a line in §16.
2. **`field` and `reason` on household validation errors.** §16 says `reason: courses_all_optional` (`field: courses`) but the household `writeErr` sent only a message. Now sent for all validation errors.
3. **Delete / Archive refusals.** §16 says `field: replacement` with no `reason`; one `reason: replacement_invalid` is added, and Archive uses `replacement` too although its body key is `replacementId`.
4. **`PATCH /api/courses/{id}`.** `main: true` on the main Course (`200`, no-op) and an empty body (`422 nothing_to_change`) are not in §16.
5. **Date Attendance `PUT`.** Absent `optOutMemberIds` is `null`; `{}` is now `422` (it used to mean "nobody"). §16 should say so.
6. **Shapes §16 leaves open:** `ruleOut` in `impact.slotRules` and `removes.slotRules`, and the items of `removes.plannedMeals` (defined above). Pinned-first order of `removes.plannedMeals` is ours.
7. **`changed: courses` is not mapped to a replan** in `plan.ReasonForEvent` (B's file). C1 publishes `mealSlots` (and a `recipes` event) with it. B or C2 can map `courses`, after which C1 drops the extras.
8. **Course ids in payloads and the plan shim.** Course and Meal Slot payloads carry the real main Course id. The plan store reads the main Course as `0` until C3, so the plan routes (C2) would show `courseId: 0` for it. Suggest C2 maps it to the real id on the way out (the same one-line lookup), so the SPA never sees `0`; C1 does not depend on it.
9. **A Recipe losing a Course** has no preview endpoint: the editor (team E) can list the Slot Rules from `GET /api/slot-rules` (gains `courseId` in C2) and filter by Recipe.
10. **Archive of an already archived Course** is not specified by §16 or tested; the developer follows the store.
11. **Unresolved Pinned meals** go with a Course (taken off a slot, archived) and are listed first, as the PM decided; the Recipe route is the opposite (Pinned stay), as crs-a gap 4.
12. **Single-slot `PATCH`** does not answer `removes` (PM decision, crs-a gap 5).
