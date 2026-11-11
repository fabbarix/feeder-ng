# Courses, team G1: reminders per Course and slot, migration 1410, Shopping List across Courses

Step 1 (Designer / test author). Spec §9 and §12, [crs-plan.md](crs-plan.md) §1.5 and the G1 scope, ADR 0008. Does not touch the GLOSSARY, the spec, store packages, `httpapi`, web or the planner. Migration 1400 is not touched either (the `AND scope NOT GLOB 'meal:*/*/*'` guard is a small A2 job).

## 1. Notifications

A **Planned Meal is one Course of a Meal Slot** (ADR 0008), so `notify.MealFact` is one Course. Reminders:

| Type | Count | Key | Due |
|---|---|---|---|
| Advance Step | one per Course and Step | `advanceStep:<date>/<slot>/<course>/<step>@<due UTC>` (new) | slot time minus lead time (unchanged) |
| Start cooking | one per slot | `startCooking:<date>/<slot>@<due UTC>` (unchanged) | slot time minus the `cook.Timeline` total of the slot's Courses |
| Confirm Cooked | one per slot | `confirmCooked:<date>/<slot>@<due UTC>` (unchanged) | slot time + 2 h |

### 1.1 Fact model (`internal/notify/types.go`)

`MealFact` gains `CourseID int64`, `Steps []schedule.Step` (the Recipe's Steps, Advance included, as `cook.Course.Steps` wants them) and `ReheatSeconds int` (a Leftover-served Course). **`TotalTime` is removed**: the timeline replaces it. The facts source lists the Planned Meals of one slot together, **in the slot's Course order** (`courses.position`); `Compute` passes that order to `cook.Timeline` and uses it to name Recipes.

`CourseID` must be the **real id of the main Course**. The plan store's shim reads the main Course as `0` (`internal/plan/store`, `courseOut`) until C3 removes it; `facts` must turn 0 into the id of the `is_main` Course, because migration 1410 writes that id into the stored keys. If it did not, every Advance Step already sent would be sent again after the upgrade. A facts test pins this.

### 1.2 `Compute`

Group the Planned Meals (`State == MealPlanned`) by `(Date, MealSlotID)`.

- **Advance Step**: as today per fresh (not `FromLeftover`) Planned Meal, with the Course in the key.
- **Start cooking**: build `cook.Course`s from the slot's planned meals, in order: a fresh meal is `{ID: CourseID, Steps}`; a `FromLeftover` meal with `ReheatSeconds > 0` is `{ID, Reheat: true, ReheatSeconds}`; a `FromLeftover` meal with `ReheatSeconds == 0` is left out. No fresh Course in the slot, a `cook.Timeline` error (`ErrInvalidCourse`: bad Steps, duplicate id) or a total of 0 gives no Start cooking, and the slot's other reminders are unaffected. Cooked and skipped meals are not in the timeline (only what is still to cook). `At = SlotAt - TotalSeconds`.
  - Body: when exactly one Course is on the timeline, unchanged: `Start cooking <Recipe> now to eat at 19:30`. With two or more: `Start cooking now for 19:30: <Recipe> first`, where the Recipe is that of the first Item of `Result.Items` (the Item starting at 0; ties already broken by `cook.Timeline`).
- **Confirm Cooked**: one per slot that has at least one planned meal (a Leftover-served Course counts, as today). Body `Did you cook A?`, `A and B?`, `A, B and C?` over the still-planned meals in Course order. A fully resolved slot gives none.
- `AdvanceStepsOn` (Today) is unchanged.

### 1.3 Facts source (`internal/notify/facts`)

Fills `CourseID` (real main id), `Steps` (convert `recipe.Step` to `schedule.Step`, including `After`), `ReheatSeconds` for a Leftover-served meal (the Recipe's `ReheatMinutes`; with none, the same default Reheat uses elsewhere, which the Developer finds in the Cook Mode code), and orders a slot's meals by Course position.

### 1.4 Migration 1410 (`internal/db/migrations/1410_reminder_keys.sql`)

Rewrites `push_sent.key` of `advanceStep:` rows only, per crs-plan §1.5: `p = instr(substr(key, 24), '/')`, new key `substr(key, 1, 22 + p) || '/' || MAIN || substr(key, 23 + p)`, with `MAIN = (SELECT id FROM courses WHERE is_main = 1)` (the flag, never a literal). Start cooking, Confirm Cooked and the other types are untouched. The file in this commit is a no-op stub. It must merge in the same merge as the `Compute` change, never before or after.

## 2. Shopping List

No new rule. `internal/shopping/httpapi/wiring.go` already lists every Planned Meal (every Course) and `Derive` sums them. Course Attendance reaches the list through `Batches`, which the planner stores per Course (3.5 portions of a yield-4 Recipe = 0.875 Batch). A Course covered by a Whole meal has no Planned Meal. These tests pass today: they pin the rule so a later change cannot break it. No production code is expected to change.

## 3. Tests (all written first)

| Where | What | State |
|---|---|---|
| `internal/notify/compute_test.go` (changed) | `curry` fact carries `CourseID` and `Steps`; Start cooking from the timeline | red/green mix |
| `internal/notify/courses_test.go` (new) | key formats; Advance Step per Course; no resend after 1410; one Start cooking per slot (active chain, passive hold, Leftover Reheat, nothing fresh, cooked Course, unplaceable timeline); one Confirm Cooked naming the Recipes | red |
| `internal/notify/facts/facts_test.go` | real main id, Steps, Course order, Reheat seconds | red |
| `internal/db/reminder_keys_migration_test.go` (new) | the rewrite (non-1 main id, two-digit slot, two subscriptions, every other type untouched, second run a no-op) | red |
| `bdd/features/notify-ops/course_reminders.feature` (new, steps in `bdd/steps_notify_ops_test.go`) | the same behaviour end to end | red |
| `internal/shopping/derive_test.go`, `httpapi/httpapi_test.go` | sum over Courses, Course Attendance Batches, covered Course, kept Planned Meal | green (pin the rule) |

## 4. Stubs in this commit

`MealFact` fields; `Compute` keeps the old behaviour (a per-meal `cook.Timeline` total for Start cooking, old keys, per-meal Confirm Cooked); `facts` fills only `CourseID` (0 for main); `1410` is `SELECT 1;`.
