# CRS team A: data, migration and stores (design note)

Step 1 of the pipeline (designer / test author) for team A of [crs-plan.md](crs-plan.md). Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §3, §3.1, §4, §7, §16. Branch `team/crs-a`, from main `934f9b9`.

This note gives the order of work, the API of every new package and method, the rules the stubs stand for, the test inventory, and the gaps found. The tests are red on purpose; the stubs compile, so `go vet ./...` and the build stay green and **only the new tests fail** (`build/check.log` of this worktree).

## 1. Scope of this commit

In scope: migration 1400 (tests only: the file itself is the developer's), `internal/course` and `internal/course/store`, Courses and Whole meal in the Recipe store, Meal Slot Courses, the optional flag and Course Attendance in the household store, Course-keyed rows and `relaxed` in the plan store (with the `CourseID == 0` shim), the cook scope shim, `backup.SnapshotNamed`, `db.Pending` and `db.NeedsPre1400Snapshot`, the start-up wiring in `cmd/feeder`, and the two fields of `internal/plan/types.go`.

Not in scope: migration 1410 (G1), handlers and API (C), the planner (B), web.

**RX (per-cell Exclusion detail for Couldn't plan).** Not in 1400. If the RX designer needs storage it is a separate later migration (any number above 1400 that is not G1's 1410); nothing here reserves a column or a table for it. 1400's `plan_unfilled` keeps `eliminated_json` as it is.

What the commit changes outside tests:

| File | Change |
|---|---|
| `internal/plan/types.go` | `Meal.Relaxed bool`; `SlotInfo.Courses []SlotCourse` with `SlotCourse{CourseID, Main, Optional, Attendance}` (crs-plan §2.4; real code, not a stub) |
| `internal/course/course.go`, `internal/course/store/store.go` | new, stubs |
| `internal/household/courses.go`, `internal/household/store/courses.go` | new, stubs; `MealSlot.Courses`, `MealSlotInput.Courses`, `SlotChange.Courses`, `BatchInput.DryRun`, `BatchResult.Removes`, `ValidationError.Reason`, `ErrCourseNotInSlot` added to existing types |
| `internal/recipe/recipe.go`, `internal/recipe/store/store.go` | `Input.CourseIDs`, `Input.WholeMeal`, `Recipe.Courses`, `Summary.CourseIDs/WholeMeal`, `CourseRef`, `CodeCoursesEmpty`, `CodeCourseUnknown`, `DefaultWholeMeal`, `LostCourses` (stubs), `ListFilter.CourseID/NotCourseID` |
| `internal/db/db.go` | `Migration1400`, `Pending`, `NeedsPre1400Snapshot` (stubs), `ErrNotImplemented` |
| `internal/backup/backup.go` | `PreSnapshotFile`, `SnapshotNamed` (stub), `ErrNotImplemented` |
| `cmd/feeder/startup.go` | `prepareDatabase` (stub; `run` still calls `db.MigrateEmbedded` until the developer wires it in) |
| `internal/plan/store/store_test.go` | lines 244 and 255 use the chip code `favourite` instead of `best_available` (test data only; the store treats codes as opaque, so these stay green) |

The stubs return `ErrNotImplemented` (or a zero value where the function has no error), never panic.

## 2. Order of work for the developer

One developer, one worktree. Each step ends with its tests green and the rest of `go test ./...` still green.

1. **Migration `internal/db/migrations/1400_courses.sql`** (`-- feeder:foreign-keys=off` first line), exactly as crs-plan §1.1, with `db.Pending` and `db.NeedsPre1400Snapshot`. Go: `courses_migration_test.go`, `pending_test.go`. Notes from validating the tests against a throw-away draft:
   - **Every rebuild must copy every current column.** `leftovers` also has `discarded_on` (0600); the plan's column list for it omits that. The migration test compares all fields before and after.
   - `UNIQUE (meal_slot_id, course_id, recipe_id, tag)` on `slot_rules` does not stop a repeat of a rule by Recipe or by Tag, because the other column is NULL (as before); the store keeps checking for duplicates itself (`ErrDuplicateRule`). The migration test therefore does not assert a DB-level duplicate failure.
   - On a **fresh** database `sqlite_sequence` already has a `planned_meals` row with `seq = 0` (migration 1100 leaves it), so the plan's "no row is written" is only true of 1400 itself. The test accepts "no row or seq 0" and no `planned_meals_new` row.
   - `INSERT INTO sqlite_sequence … SELECT … FROM sqlite_sequence WHERE name = 'planned_meals'` before the `DROP TABLE` is exactly what the counter test needs.
   - After 1400, any raw-SQL `INSERT INTO planned_meals / leftovers / slot_rules / plan_unfilled` needs `course_id`. In the repo only `internal/plan/store` (which the developer changes) writes them; `internal/db/autoincrement_test.go` inserts a Planned Meal **before** 1400 (`upTo("1100_")` then the rest) and is unaffected; it never inserts one after.
2. **`internal/course`** pure rules (`course_test.go`), then **`internal/course/store`** (below). The store needs only the tables of step 1.
3. **Recipe**: `recipe.Validate` (CourseIDs dedupe/empty), `DefaultWholeMeal`, `LostCourses`, then the store (`store_courses_test.go`). `Create` must work without CourseIDs because every existing caller creates Recipes that way (store tests, import through `CreateTx`, the Recipe Assistant): they get the main Course.
4. **Household**: `ValidateSlotCourses`, `NormalizeSlotCourses` and `CourseAttendance` (`courseattendance_test.go`), then the store (`store/courses_test.go`).
5. **Plan store**: the `CourseID == 0` shim, Course-keyed SQL, `relaxed`, `Leftover.From`/`Meal.From.From` course, `SlotRule.CourseID` (`store/courses_test.go`).
6. **Cook store shim** (`cook/store/shim_test.go`).
7. **`backup.SnapshotNamed`** (`snapshot_named_test.go`) and **`prepareDatabase`** + the call in `run` (`cmd/feeder/startup_test.go`).

Existing green tests that exercise the new behaviour indirectly (`internal/plan/runner`, `internal/plan/httpapi`, `internal/cook/service`, `bdd`, `internal/testkit`) must stay green: they create Meal Slots, Recipes and Planned Meals through the stores or through raw SQL that does not touch the changed tables. A raw-SQL `INSERT INTO meal_slots` (e.g. `plantest.SeedMealSlot`) gives a slot with **no** `meal_slot_courses` row; the household store returns an empty `Courses` list for it, and nothing in A reads Courses to plan. B's adapter reads `CoursesOn`, and B owns `plantest` (it should seed the main Course there).

## 3. API of the new packages

### 3.1 `internal/course` (pure)

```go
const MaxCourses = 20; const MaxNameRunes = 40
var ErrNameInvalid, ErrNameTaken, ErrTooMany, ErrOrder, ErrMain, ErrLast, ErrPlanned, ErrArchived, ErrReplacement, ErrNotFound error

type Course struct { ID int64; Name string; Position int; Main, Archived bool }
type Listing struct { Course; RecipeCount, MealSlotCount int; Planned bool }
type Impact struct { Planned bool; Recipes, RecipesOnlyThis, MealSlots, MealSlotsOnlyThis int
                     PlannedMeals []ImpactMeal; SlotRules []ImpactRule }

func NameKey(name string) string                          // trim, collapse whitespace, lower-case; no accent folding
func CleanName(name string) (string, error)               // ErrNameInvalid unless 1..40 runes after cleaning
func CheckOrder(listed, ids []int64) error                // ErrOrder unless a permutation
func MoveMain(list []Course, id int64) ([]Course, error)  // exactly one flag moves; copy; ErrNotFound, ErrArchived
func CanRemove(c Course, active []Course) error           // ErrMain first, then ErrLast
func RemovalFor(planned bool) Removal                     // RemoveArchive if planned, else RemoveDelete
func CheckReplacement(removed, replacement int64, activeIDs []int64, needed bool) error // ErrReplacement
func Reassign(owners map[int64][]int64, removed, replacement int64) map[int64][]int64    // only owners that change
```

`NameKey` is the same rule as `recipe.TagKey` (a test compares them) and is what 1400 seeds as `name_key` (`main`, `side`, `starter`, `dessert`). Import's name matching and the API use it too.

### 3.2 `internal/course/store`

```go
func New(d *sql.DB, clk clock.Clock) *Store
func (s *Store) List(ctx, includeArchived bool) ([]course.Listing, error) // household order; counts include archived Recipes
func (s *Store) Get(ctx, id) (course.Course, error)                       // course.ErrNotFound
func (s *Store) Main(ctx) (int64, error)
func (s *Store) Create(ctx, name) (course.Course, error)                  // last in order; ErrNameInvalid/ErrNameTaken/ErrTooMany
func (s *Store) Rename(ctx, id, name) (course.Course, error)              // may change only the spelling of its own name
func (s *Store) MakeMain(ctx, id) (course.Course, error)                  // clear the old flag, then set the new one, one tx
func (s *Store) Reorder(ctx, ids []int64) error                           // ids = the active Courses, once each; ErrOrder
func (s *Store) Impact(ctx, id) (course.Impact, error)
func (s *Store) Delete(ctx, id, replacementID int64) (course.Impact, error)   // never-planned Courses only
func (s *Store) Archive(ctx, id, replacementID int64) (course.Course, course.Impact, error)
func (s *Store) Unarchive(ctx, id) (course.Course, error)                 // last in order; ErrTooMany at 20 active
```

Rules the store enforces:

- `name_key` is unique over **all** Courses, archived ones included (it is the column's UNIQUE constraint), so a new Course cannot take an archived Course's name (`ErrNameTaken`). 20 counts active Courses only.
- Check order for Delete and Archive: `ErrNotFound`, `ErrMain`, `ErrLast`, then (Delete only) `ErrPlanned`, then `ErrReplacement`. `ErrPlanned` is true when any `planned_meals` or `leftovers` row points at the Course in any state.
- A replacement is **needed** when some Recipe or Meal Slot would be left with no Course (`course.Reassign` over `recipe_courses` and `meal_slot_courses`). A replacement that is given but not needed is still validated (`course.CheckReplacement`).
- One transaction does all of: `Reassign` for Recipes and Meal Slots (the replacement goes **only** to owners left with none; a slot's replacement is appended at the removed Course's position, keeping `UNIQUE (meal_slot_id, position)` valid; its `optional` is false); delete the removed Course's usual opt-outs and date overrides (the overrides' opt-outs cascade) on every slot, **never** copying them to the replacement, and leave the replacement's own opt-outs alone; delete its Slot Rules; delete its unresolved Planned Meals (`state = 'planned'`, Pinned included) with `date >= today`; delete its `plan_unfilled` rows. Cooked, Not cooked and past Planned Meals and Leftovers keep their `course_id`. Delete then deletes the `courses` row; Archive sets `archived = 1` and keeps it.
- "Today" is the clock's now in `household_settings.time_zone` (the stores read it themselves; no caller passes a date).
- `Reorder` renumbers the active Courses `0..n-1` in the given order; archived Courses move after them (their relative order kept).

### 3.3 Recipe

```go
// recipe.Input gains
CourseIDs []int64 // nil: absent (create: the main Course; update: keep). Non-nil empty: ValidationError{Field:"courses", Code: CodeCoursesEmpty}. Repeats dropped, order kept.
WholeMeal *bool   // nil: absent (create: DefaultWholeMeal; update: keep the stored value). A stored Recipe always has it set.
// recipe.Recipe gains   Courses []CourseRef{ID, Name}  // household order, read only
// recipe.Summary gains  CourseIDs []int64 (never nil), WholeMeal bool
func DefaultWholeMeal(readyMeal bool, courseIDs []int64, mainID int64) bool
func LostCourses(before, after []int64) []int64
// store.ListFilter gains CourseID, NotCourseID (0 = any)
```

The store resolves the ids (`ValidationError{Field:"courses", Code: CodeCourseUnknown}` for unknown, archived or zero), writes `recipe_courses` and `recipes.whole_meal`, and reads Courses back in **household order** (`courses.position`). Taking the main Course off a Whole meal Recipe keeps the flag. **A Recipe that loses a Course**, in the same transaction as the update and only when the update succeeds: delete its Slot Rules **by that Recipe** on the lost Courses; delete its `state = 'planned'`, `pinned = 0`, `date >= today` Planned Meals in the lost Courses (fresh ones and those served from its Leftovers alike); keep Pinned, Cooked, Not cooked and past ones, other Courses' meals, Slot Rules by Tag, and other Recipes' rules. The replan itself is the handler's event (C/B).

### 3.4 Household

```go
type SlotCourse struct { CourseID int64; Name string; Main, Optional bool; OptOutMemberIDs []int64 } // read; opt-outs ascending
type SlotCourseInput struct { CourseID int64; Optional bool; OptOutMemberIDs []int64 }              // nil keeps stored, non-nil replaces
MealSlot.Courses []SlotCourse; MealSlotInput.Courses []SlotCourseInput (nil: create=main required, update=unchanged)
SlotChange.Courses *[]SlotCourseInput; BatchInput.DryRun bool; BatchResult.Removes Removals
func ValidateSlotCourses([]SlotCourseInput) error      // *ValidationError{Field:"courses", Reason: courses_empty | courses_all_optional}
func NormalizeSlotCourses([]SlotCourseInput) []SlotCourseInput
func CourseAttendance(slot []Attendee, usual []int64, date *[]int64) []Attendee
type CourseDay struct { CourseID int64; Main, Optional bool; OptOutMemberIDs []int64; IsOverride bool; Attendance []Attendee }
type Removals struct { PlannedMeals []RemovedMeal; SlotRules []RemovedRule }
// store
func (s *Store) CoursesOn(ctx, slotID, date) ([]household.CourseDay, error)        // the slot's Courses, slot order; household.ErrNotFound
func (s *Store) SetDateCourseOptOuts(ctx, slotID, date, courseID, *[]int64) error  // non-nil sets (empty = everyone), nil drops
```

`CourseAttendance` (the only place opt-outs are subtracted): the slot's Attendance on that date, less the date's opt-outs for the Course when `date != nil` (an override row exists, even empty), else less the usual ones. The result is a new slice; Portion Factor overrides and order are kept; an opt-out of a Member who is not attending changes nothing. (The plan's `[]MemberID` is `[]int64` here: there is no `MemberID` type.)

The store, in the transaction that saves a slot's Courses (`CreateSlot`, `UpdateSlot`, `UpdateSlotsBatch`):

- writes `meal_slot_courses` by delete-and-reinsert (so reorder works under `UNIQUE (meal_slot_id, position)`); opt-outs are **never** deleted because of that, since their tables have no foreign key to it;
- validates every listed Course (active) and opt-out Member (`ValidationError{Field:"courses", Reason: course_unknown}` / `{Field:"courses[i].optOutMemberIds", Reason: member_unknown}`), writing nothing on failure;
- per listed Course: `OptOutMemberIDs == nil` keeps the stored opt-outs (none for a Course new to the slot), non-nil replaces them. A single edit stores an opt-out of a non-attending Member (it applies again when they return); **the batch ignores** such Members for each Matching Meal Slot;
- for each Course **no longer** on the slot: delete its usual opt-outs and its date overrides (and their opt-outs), its Slot Rules and `plan_unfilled` rows, and its `state = 'planned'` Planned Meals from today on (Pinned included); report them as `Removals`. `UpdateSlot` with `Courses == nil` touches none of this. Adding a Course back later starts with nobody opting out.
- `BatchInput.DryRun` runs the same work and rolls it back; `BatchResult.Removes` is identical for the dry and the real run.
- `ClearDateAttendance` also drops the date's Course overrides; `SetDateAttendance` does not touch them. Deleting a Member, a Meal Slot or a Course cascades through the foreign keys.

### 3.5 Plan store: the shim, precisely

While callers use `CourseID == 0`:

| Direction | Rule |
|---|---|
| In (any method taking a `plan.Key`, `Meal.From.From`, `Leftover.From`, `SlotRule.CourseID`, `Unfilled.Key`, `Changes.Deletes/Upserts/ClearUnfilled`) | `0` and the real id of the main Course are the same cell; any other id is that Course (`ErrUnknownRef` when it does not exist) |
| Out (every read and every returned value) | the **main Course is always `0`**, every other Course its real id: one consistent form, so a `map[plan.Key]…` built from `Meals()`, `Unfilled()`, `Leftovers()` or `LeftoverSources()` is found by the keys `SlotInfo.Key` and reconcile use |
| Main means | the Course with `is_main = 1` at the time of the call; after **Make main** the old main reads with its real id and the new main reads `0` |

`Meals()` orders by date, Meal Slot id, then the Course's household position. `AddLeftover` stores `from_course_id`; `Dependants`, `LinkLeftover` and `LeftoverFrom` match on the source's Course; `AddSlotRule` rejects a repeat within one Course (`ErrDuplicateRule`) and allows the same rule in two Courses; `History` ignores the Course (Cool-down counts a Recipe across Courses). `Meal.Relaxed` is stored in `planned_meals.relaxed` and cleared by an upsert that is not relaxed. The reason `no_course_recipes` is stored as it comes (reasons are opaque to the store). C3 removes the shim.

### 3.6 Cook store shim

`meal:<date>/<slot>` on write and on **every lookup** (`InsertTimer`, `Timers`, `StepTimer`, `SetMark`, `Marks`) means `…/<main id>`; every returned timer's scope and every `Timers("")` row is written back **two-part** when it is the main Course; other Courses' scopes are three-part both ways; recipe scopes and free timers are untouched; one timer per (scope, Step) holds across the two forms. The main id is read per call (`courses.is_main`).

### 3.7 Backup and start-up

```go
backup.SnapshotNamed(ctx, db, dir, name) (Info, error) // name ^feeder-pre-\d{4}\.db$ only; same VACUUM INTO / integrity_check / 0600 / rename / folder lock as Snapshot; replaces an existing file; Info.Day == ""
db.Pending(ctx, d, name) (bool, error)                 // true when schema_migrations lacks name, or the table is missing
db.NeedsPre1400Snapshot(ctx, d) (bool, error)          // Pending(1400) and planned_meals exists with ≥ 1 row
prepareDatabase(ctx, d, dataDir, logger) error         // in cmd/feeder/startup.go: snapshot if needed, then db.MigrateEmbedded
```

`run` calls `prepareDatabase(ctx, d, cfg.DataDir, logger)` instead of `db.MigrateEmbedded`. On a snapshot error it returns before migrating, with the error naming `feeder-pre-1400.db`, and logs one line. `backup.List`/`nameRE`/`Prune` already ignore the file; tests prove it.

## 4. Tests (red) and where they live

| Area | File | What it pins |
|---|---|---|
| Migration 1400 | `internal/db/courses_migration_test.go` | plan §1.4 points 1 to 10, plus constraints (one main, not archived+main, relaxed/optional/whole_meal 0-1, key uniqueness, new reason), foreign-key-off failure rolls back and names the file |
| Pending / snapshot need | `internal/db/pending_test.go` | `Pending`, `NeedsPre1400Snapshot` (6 situations) |
| Snapshot | `internal/backup/snapshot_named_test.go` | pattern, 0600/0700, verified copy, replace, failure keeps the old file, not listed, not pruned, folder lock |
| Start-up | `cmd/feeder/startup_test.go` | snapshot before migrate, none on a fresh install or without Planned Meals, not again after 1400, failure stops without migrating |
| Course rules | `internal/course/course_test.go` | the pure rules of plan §2.3 |
| Course store | `internal/course/store/store_test.go` | list/counts/Planned, create/rename/make-main/reorder rules, Impact, Archive and Delete in one transaction (replacement only where needed, opt-outs dropped and never inherited, unresolved plan from today dropped, history and Leftovers keep their Course), refusals change nothing, Unarchive |
| Recipe | `internal/recipe/courses_test.go`, `internal/recipe/store/store_courses_test.go` | defaults, validation, household order, Whole meal rules, loses-a-Course, filters, delete |
| Household | `internal/household/courseattendance_test.go`, `internal/household/store/courses_test.go` | `CourseAttendance` table, validation/normalisation; reorder/batch keep opt-outs, removal drops them in the same tx, archive/delete are in the Course store, date opt-outs, `member_unknown`, cascades |
| Plan store | `internal/plan/store/courses_test.go` | the shim (lookups never miss, reconcile, Unfilled, either form of main), `relaxed`, sources, rules, history, Make main, unknown Course |
| Cook store | `internal/cook/store/shim_test.go` | both-way mapping for timers and marks, other Courses three-part, upgraded scopes read two-part |

Because A has no routes, there is no BDD feature file in this commit: the BDD scenarios belong with C1 (below).

## 5. Gaps and decisions for the spec / plan

1. **`leftovers.discarded_on`** is missing from §1.1's column list for the `leftovers` rebuild (see §2 step 1). The tests cover all fields.
2. **Fresh-database counter**: §1.4 point 9 says `planned_meals` has no `sqlite_sequence` row on a fresh database; migration 1100 already leaves a row with `seq 0`. The test says "no row or 0".
3. **"From today on"** has no stated source. Decision: each store computes it (clock now, household time zone), so no caller passes a date. Used by the Course store, the household store and the Recipe store.
4. **Pinned meals when a Course leaves a Meal Slot or is removed**: §3.1 says unresolved Planned Meals go and "Pinned ones are listed before saving", which implies Pinned ones go too; implemented and tested that way. A Recipe losing a Course is the opposite (its Pinned meals stay), as §4 says.
5. **Single Meal Slot edit and `removes`**: §16 gives `removes` to the batch only. `UpdateSlot` still removes in the same transaction but does not report it; C can use a one-weekday batch `dryRun` for the preview. Asking the PM whether `PATCH /api/meal-slots/{id}` should answer `removes` too (would need `UpdateSlot` to return it).
6. **Course name reuse**: the plan's `name_key TEXT NOT NULL UNIQUE` forbids a new Course with an archived Course's name; §3.1 only says names are unique "in the list". Kept as the plan has it (409 `course_name_taken`); say so in the UI copy.
7. **`PUT /api/courses/order`** says "every listed Course once": taken to mean every **active** Course.
8. **`ErrLast`** cannot happen in a consistent database (the last Course is the main one, and `ErrMain` wins); it is checked and tested as a pure rule only.
9. **Raw-SQL seeds in other teams' tests**: a Meal Slot or Recipe inserted by raw SQL has no Course rows. Harmless for A; B's `plantest.SeedMealSlot` and `SeedRecipe` should add the main Course.
10. `cook/service/adapters.go:104` joins `planned_meals` to `meal_slots` by (date, slot) only; it is correct while only the main Course exists and must pick the Course when B/C2 start to write Side meals (C's file).

## 6. Appendix: BDD scenarios for C1 that A's stores make possible

(Gherkin text only; C owns `bdd/features/courses/` and the steps.)

```gherkin
Scenario: Reordering a Meal Slot's Courses keeps who opts out
  Given Dinner on Monday serves Main and Side, and Sam opts out of Side
  When the Admin saves Dinner with Side first and Main second, without opt-outs
  Then Dinner's Side still shows Sam opting out

Scenario: Taking Side off a Meal Slot drops its opt-outs and its unresolved Planned Meals
  Given Dinner serves Main and Side, Sam opts out of Side, and Side has an unresolved Planned Meal on Wednesday
  When the Admin saves Dinner with Main only
  Then the answer lists that Planned Meal under "removes"
  And adding Side back later starts with nobody opting out

Scenario: Upgrading a Household with planned meals leaves a snapshot to go back to
  Given a Household with Planned Meals running the previous release
  When Feeder starts with the Courses release
  Then <data>/backups/feeder-pre-1400.db exists
  And Settings > Backups does not list it
```
