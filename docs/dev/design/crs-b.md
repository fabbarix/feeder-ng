# CRS-B: the planner with Courses (design note for the Developer)

Team B of [crs-plan.md](crs-plan.md) §2. Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §7.1 to §7.5 and §9. Glossary: **Course**, **main Course**, **Whole meal**, **optional Course**, **Course Attendance**, **Planned Meal**, **Cool-down**, **Variety Rule**. The tests are red on purpose; this note says what makes them green. Where the note and a test disagree, the test wins and the Reviewer is told.

Files you own: `internal/planner/**`, `internal/plan/{plan,cook,types}.go` (types only as stubbed), `internal/plan/runner/**`, `internal/plan/plantest/**`. The stubs (new fields and constants in `internal/planner/types.go`, `Meal.Relaxed`, `SlotCourse` and `SlotInfo.Courses` in `internal/plan/types.go`) are in; `Meal.Relaxed`, `SlotCourse` and `SlotInfo.Courses` are exactly crs-plan §2.4, so merging with team A's first commit is identical or trivial.

## 1. The model: one planner cell per Course

A **cell** is one Course of one Meal Slot on one date: `planner.Slot` (the name stays) keyed by `SlotKey{Date, MealSlotID, CourseID}`. Everything the walk did per slot it now does per cell. The adapter builds the cells; the planner never sees a "slot with Courses".

| Field | Meaning |
|---|---|
| `Key.CourseID` | The Course. **0 is the transition shim**: no Course fit, not Whole-meal aware, `Main`/`Optional` false. A cell with Course 0 plans exactly as today, so the existing single-slot tests are the golden for "an upgraded single-Course Household plans as before". |
| `Attendance` | The cell's **Course Attendance** (the slot's Attendance less this Course's opt-outs, from `SlotCourse.Attendance`). It is the only attendance the planner reads: portions, Batches, Leftover size, Exclusions, Dislikes, Favourites. |
| `Main`, `Optional`, `Position` | From `SlotCourse.Main`, `Optional`, and the index in the slot's Courses. |
| `AllOptedOut` | The slot has attendees but every one opts out of this Course (so `Attendance` is empty). A slot nobody attends leaves it false. |
| `Rules` | The Slot Rules of this cell's Course. |
| `Recipe.CourseIDs`, `Recipe.WholeMeal` | Course fit and Whole meal. |

**Walk order.** Sort cells by `(At, MealSlotID, Date)` as today, then, inside one Meal Slot on one date, by group: main Course (0), other required Courses (1), optional Courses (2); then `Position`; then `CourseID`. `Result.Placements`, `Unfilled` and `NotServed` are in this order. Duplicate cell keys give `ErrDuplicateSlot`; the same slot with two Courses is not a duplicate.

**The slot group.** Cells with the same `(Date, MealSlotID)` are one group. The rules that look at "the rest of the slot" use it: covering, one Recipe per slot, the Whole meal hold-back, reservation gap 0.

## 2. The per-cell algorithm (spec §7.2)

`fill(i)` for a cell whose role is empty, in this order. Steps 0 and 0b are decided **before** step 1 and never record a reason.

**Roles.** Add `roleCovered` and `roleNotServed`. `classify` and the pre-walk pass in `newState` set them; they are never Kept, never placed, never Unfilled, and never join the history. They go to `Result.NotServed` with their cause.

**Pre-walk (in `newState`, after `classify`, before the history is built):**

1. *Not served by attendance.* A cell with `AllOptedOut`: if its role is empty, kept or planned-from-Leftover (an unpinned Planned Meal), it becomes `roleNotServed` (`NotServedNoCourseAttendance`) and its Existing meal is dropped; Pinned, Cooked and Skipped stay as they are (no entry in `NotServed`).
2. *Covering by what already exists.* For each group, take the main cell. If its Existing meal (any state: Planned, Pinned, Cooked, Skipped; fresh or from a Leftover) is a Whole meal (`Recipe.WholeMeal`), every other cell of the group that is empty, kept or planned-from-Leftover becomes `roleCovered` (`NotServedCovered`), including one with an unpinned Existing meal (that is the removal: it is neither Kept nor placed, so `Reconcile` deletes it). A Pinned, Cooked or Skipped meal in another cell stays and that cell is **not** covered. A group with no main cell is never covered. A Whole meal in a cell that is not `Main` is an ordinary Recipe.
3. *The "other Course holds a fixed meal" flag.* Per group, `fixedBeside(i)` is true when another cell of the group has a Pinned, Cooked or Skipped Existing meal. Used by the Whole meal hold-back (below).

**Walk-time covering.** When the main cell is placed (fresh or Leftover) and the Recipe is a Whole meal, run the same covering as pre-walk 2 on the rest of the group: cells that are still empty become `roleCovered`; cells that were kept or planned-from-Leftover become `roleCovered` too and their fresh cook leaves the history (remove the `fresh{seq: j}` entry, as the keep check does). A covered cell has no Couldn't plan reason even when no Recipe is marked with its Course.

**0b at walk time.** An optional cell that finds neither a Leftover nor a strict candidate becomes `NotServedOptional`. `no_course_recipes` and `no_candidates` are never recorded for it. An optional cell on a slot nobody attends (empty attendance, `AllOptedOut` false) is `NotServedOptional` with no reason (a reason is for required Courses only; see gaps).

**Step 1: Leftover first** (`takeLeftover`). A pending Leftover is placed when: its Recipe is marked with the cell's Course (Course fit; skipped for Course 0); it covers the cell's portions (`Attendance`); it is before its Use-by; no attendee of the cell excludes the Recipe or an Ingredient; the Slot Rule rule of the cell is satisfied. **Plus the two new rules:**
- skip it if its Recipe is already planned in another cell of the group on that date (a Pinned, Cooked, Skipped, kept, Leftover-served or just-placed meal);
- if the cell is `Main` and the Leftover's Recipe is a Whole meal, skip it when `fixedBeside` is true.
Among the rest the soonest Use-by wins, ties as today. A Leftover is not tied to the Course it was cooked in; `pending.from` is the full cell key (with Course). Dislikes are ignored. Cool-down and Variety Rules are not looked at.

**Step 2: candidates** (`evaluate`). Start from non-archived, `Yield > 0` Recipes. In order:
1. **Course fit**: marked with the cell's Course (skipped for Course 0).
2. **Slot Rule narrowing** (not in Swap).
3. If, after 1, no Recipe is marked with the Course at all (counting non-archived Recipes with `Yield > 0` marked with it, before the Slot Rule narrowing): a **required** cell is `Unfilled{Reason: UnfilledNoCourseRecipes}` (all `Eliminated` fields 0, `SlotRuleClaimed` false); an optional cell is `NotServedOptional`. A Course with Recipes that the Slot Rule narrows to nothing is `no_candidates` with `SlotRuleClaimed` and `Considered: 0`, not `no_course_recipes`.
4. `reservedFor` removes reserved Recipes from the strict candidates (not counted, not Considered; they come back in a relaxed pick, below).
5. `Considered++` for every remaining Recipe, then **hard filters**, the first that removes a Recipe counts it:
   - *one Recipe per slot*: its Recipe is already planned in another cell of the group. Counts in `Considered` only (no column: "No fit" cause);
   - *Whole meal hold-back*: the cell is `Main`, the Recipe is a Whole meal and `fixedBeside` is true. Counts in `Considered` only;
   - **Exclusion** (an attendee of the cell excludes the Recipe or an Ingredient of it) → `Eliminations.Exclusion`;
   - **Advance Step** whose lead time has passed → `Eliminations.AdvanceStep`.
   The Recipes that pass all of them are the **hard-passing** set.
6. **Soft filters** on the hard-passing set: inside its Cool-down; breaks a Variety Rule. The ones that pass both are the **strict candidates**. `Eliminations.CoolDown` and `VarietyRule` are **never incremented** any more (they stay in the struct for JSON): a Recipe only a soft filter removes is a relaxed candidate.

**Where Exclusion eliminations are counted: one place.** Do all counting in a single method, `func (st *state) tally(i int, r Recipe, e *Eliminations) (hardPass bool)`, and inside it the Exclusion branch calls one small function, `countExclusion(e *Eliminations, i int, r Recipe)`. Today it does `e.Exclusion++`. The follow-up task B-RX records there which Member, Recipe or Ingredient Exclusions removed the candidates (per cell, capped); nothing else in `evaluate` may increment `Exclusion`. Keep `excludes()` returning a bool for the filter, and write `countExclusion` so B-RX can ask for the reasons without re-deriving the filter.

**Step 2b: relaxed pick** (required cells only; optional cells never). If there is no strict candidate and the hard-passing set is non-empty, take from the hard-passing set **plus the reserved Recipes that pass the hard filters** (a reserved Recipe is a last resort, key 1), the first by this total order, all keys ascending unless said:
1. not reserved before reserved (`reservedFor`);
2. outside its Cool-down before inside it;
3. among those inside: the **longest** gap in days to the Recipe's nearest fresh cook (`min |h.day - day|` over the whole history, before or after, any Course), then the **fewest** days of Cool-down left (`cooldown - gap`);
4. the fewest Variety Rules it would break (count of `VarietyRule` entries, each at most once);
5. the highest score (jitter included; `better()` as today for ties on score);
6. the lowest Recipe id.
Only an empty hard-passing set leaves the cell empty: `Unfilled{no_candidates}` with the hard counts and `SlotRuleClaimed`, `CoolDown` and `VarietyRule` 0.

**What `Relaxed` means.** `Placement.Relaxed` is true iff the chosen Recipe is inside its Cool-down or breaks a Variety Rule *at this cell* (computed against the history at that moment). A pick that only gave up a reservation (step 2b, key 1) is an ordinary pick: not relaxed, no chip (`TestRelaxedOrder`, "a reserved Recipe is the last resort"). The rule's own cell is the one that comes round sooner and carries the chip.

**Relaxed chip** (appended to `Why` **after** the up to 3 score chips; `buildWhy` keeps its 3-chip cap for the score chips and returns an empty list when there is nothing to say; delete `ReasonBestAvailable`):
- inside Cool-down: `Why{Code: ReasonCooldownRelaxed, RecipeID: the Recipe, Date: the nearest fresh cook}` (ties between two equally near cooks: the earlier date);
- else (only Variety Rules broken): `Why{Code: ReasonVarietyRelaxed, Tag: the first broken rule in Input.VarietyRules order}` with `Value` = the count this week including this cell when that rule's `MaxPerWeek` is broken, else `Date` = an adjacent day's cook (`NotConsecutiveDays`; the earlier of two).
One helper `relaxedChip(i, r, history)` builds it; the pick, the keep check and Swap all call it, so the chip is always computed from the same history that justified the flag.

**Step 3 to 5** (score, pick, place) are unchanged except: portions come from the cell's `Attendance`; `JitterFor` hashes the Course (below); `placeFresh` records the history entry; the new Leftover and `fitsLater` look at later **cells** (a later cell fits when the Recipe is marked with its Course, `roleEmpty`, portions fit, no Exclusion by its attendees, not already in its group, and for a `Main` cell with `fixedBeside` not a Whole meal).

**Jitter.** `JitterFor(seed, key, recipe, amp)` additionally mixes `key.CourseID` into the hash **only when it is non-zero**, so Course 0 keeps its values (golden in `TestJitterIsSeededPerCell`) and each Course gets its own.

**Optional cells.** Walked last; Leftover or strict candidate or nothing; no `no_course_recipes`, no relaxed pick, no reason. Because they walk last an optional Course never takes a Recipe a required one could use.

**Reservations (reserve.go) per cell.** `reservation.slot` indexes cells. The gap between two cells is the difference of their dates in days; **cells of the same group count as gap 0**, so a reserved Recipe is kept out of every earlier-walked cell of the same slot (main first). `isOpenSlot` is false for covered and not-served cells (they reserve nothing), for Pinned/Cooked/Skipped and for the Swap target. `onlyEligible` also requires Course fit with the rule cell's Course and uses the cell's `Attendance`. "Pinned wins" is unchanged (`freshWithin` voids the reservation), but the rule cell is then filled by a relaxed pick of the Recipe instead of staying empty (nothing to change in the reservation code; step 2b does it). Two open Slot Rule cells that reserve one Recipe: the later reservation stays void (`reservedWithin`) and the later cell gets a relaxed pick.

## 3. The keep check (spec §7.2, `state.go`)

Runs in `newState` when `!regen`, **right after `dropBlockedKept` and the kept fresh Planned Meals joining the history, before the walk** (it also runs for the Swap walk; Swap's target is `roleEmpty` so it is skipped there). Walk order, one pass over cells with role kept and `Existing.From == nil`:

1. Remove this meal's own history entry (`seq == i`) from a copy of the history (so its own date is not a cook inside its own Cool-down, and does not count towards its own Variety Rule).
2. Compute `breaks := inCooldown || varietyBlocked` for its Recipe at this cell against that history.
3. If `!breaks`: keep, `Recheck{Key, Relaxed: false, Why: nil}` (a former relaxed pick loses the flag and the chip).
4. If `breaks` and a **strict candidate** exists for the cell in that same history (step 2's filters, reservations included): **drop** it: `roles[i] = roleEmpty`, its history entry stays removed for the next meals (permanently), and the walk refills the cell (if earlier walk picks have used the strict candidates the refill is a relaxed pick as usual). No Recheck.
5. Otherwise, and if the cell is **not optional**: keep, `Recheck{Key, Relaxed: true, Why: &chip}` with `relaxedChip` from that history. An **optional** cell that breaks a rule with no strict candidate is dropped and becomes `NotServedOptional` (optional Courses are never relaxed; see gaps).

`Result.Kept` lists the kept ones as today; `Result.Rechecks` has one entry per kept fresh meal. Pinned meals, Leftover-served meals and Regenerate have none. The history entries of fixed meals stay. `validPlannedFresh` keeps checking the hard rules (Exclusion for the cell's attendees, Batches cover the cell's portions); a kept meal in a cell now covered or not served never gets here (pre-walk).

## 4. Swap (`Swap(in, key)`)

`key` is a cell key. Walk the cells before it; then for the target:
- candidates as in step 2 with `ignoreRules` (Slot Rules ignored, as today), the current Recipe excluded, **Recipes planned in another Course of the same slot and date excluded**, and **reserved Recipes never offered, strict or relaxed**;
- order: strict candidates by score (as today), then relaxed ones in the relaxed order (step 2b, keys 2 to 6; key 1 does not apply because a reserved Recipe is never in the pool), until 3 in all. No relaxed Recipe is added when there are already 3 strict ones. Each relaxed alternative has `Relaxed: true` and its relaxed chip last;
- relaxed alternatives are offered on **every** Course, optional ones included; Exclusions and Advance Steps still apply;
- the Whole meal hold-back applies to a `Main` target as in step 2 (the User's fixed Course beside it); the "Whole meal: no Side" chip is the SPA's, from `Recipe.WholeMeal`, and is not a planner chip.
`runner.Alternatives` passes the Course key and copies `Placement.Relaxed` into `Alternative.Relaxed` (new field).

## 5. The adapter (`internal/plan/plan.go`)

`BuildInput(s)`:
- **Cells.** For each `SlotInfo`: if `len(Courses) == 0`, one cell keyed `si.Key` (as today; `Main`/`Optional`/`AllOptedOut` false). Otherwise one cell per `SlotCourse` in order: `Key = {Date, MealSlotID, CourseID}`, `Position` = its index, `Main`, `Optional`, `Attendance` = the Course's attendance with zero factors dropped, `AllOptedOut = slotAttendanceWithPositiveFactor && len(cellAttendance) == 0` where the slot's attendance is `SlotInfo.Attendance`. The slot instant is shared. The past-empty-cell rule applies **per cell** (a cell with an existing meal is always kept).
- **Stored keys with Course 0.** On a slot that has Courses, a Meal, Slot Rule, `Clear` key or Leftover/Source key with `CourseID == 0` means the main Course (A's persistence shim; `normalise` at the start of `BuildInput`). On a slot without Courses, Course 0 stays 0.
- **Rules.** `Rules` per cell: the Slot Rules of the slot's Meal Slot **and that Course**.
- **Existing.** Keyed by the cell; `ExistingMeal.Relaxed = Meal.Relaxed`. `Clear` and the "over and unconfirmed is Pinned" rules apply per cell.
- `pkey` and `keyOf` carry `CourseID` (Leftover `FromSlot`, `Source.From`, `LeftoverSource`).
- Recipes pass through with `CourseIDs` and `WholeMeal`.

`Reconcile(s, res)`:
- Upserts as today per cell key; copy `Placement.Relaxed` into `Meal.Relaxed`. The relaxed chip arrives in `Why` already (`WhyAll`).
- **Rechecks.** For each `Recheck`, find the stored meal (`s.Meals`). New `Why` = the stored `Why` with every `cooldown_relaxed` and `variety_relaxed` chip removed, plus `WhyFrom(*Recheck.Why)` appended when `Recheck.Why != nil`. If `Relaxed` or the `Why` list differs from the stored meal, add an **Upsert of the stored meal** (ID, Recipe, Batches, Portions, From, State kept) with the new `Relaxed` and `Why`; otherwise write nothing.
- **Deletes.** `slotAt` is built per cell (not per `SlotInfo.Key`), so a stored unpinned meal in a covered or not-served cell (not Kept, not re-placed) is deleted.
- **Unfilled and ClearUnfilled** per cell: `Unfilled.Key` is the cell key, `Reason` may be `no_course_recipes`; `ClearUnfilled` lists every cell of the snapshot that is not Unfilled, **covered and not-served cells included** (they have no reason). `Result.NotServed` is informational for now (C2 derives `unserved` from the stored rows and the attendance); Reconcile ignores it.
- `WhyFrom`/`WhyAll` unchanged; they carry the two new codes as opaque strings.

## 6. The runner (`internal/plan/runner/**`)

Work to do (not red-tested here: the store gains its Course column in team A, and B merges after A; the Developer adds these tests then, as `runner_test.go` cases on `newEnv` with a fake that serves Courses):
- `Sources` gains `SlotCourses(ctx, mealSlotID int64, date string) ([]plan.SlotCourse, error)` (the slot's Courses in order, each with `household.CourseAttendance`); `DBSources` implements it over A's household store; the fake serves a configurable list. With an empty list the snapshot has no Courses and plans as today.
- `snapshot` fills `SlotInfo.Courses`; `Clear` (`clearAll`, `after`) lists cell keys; `invalidOnRead` checks attendance per cell (`attendancePortions` of the cell) and Slot Rules per cell (the Course of the meal's key).
- `Alternatives(ctx, key)` takes a Course key and calls `planner.Swap` with it; `Alternative` gains `Relaxed bool`.
- `SetMeal`, `Confirm`, `Unpin`, `Cooked`, `NotCooked`: unchanged logic keyed by `plan.Key` with the Course; `SetMeal` of a Whole meal in the main Course deletes the unpinned, unresolved meals in the slot's other Courses (the replan does it); the replan after a Pin runs the keep check like any other Plan.
- Tests to add once A has merged: planning a slot with Main and Side stores two Planned Meals; a Whole meal in the main Course stores one and deletes a stored unpinned Side; a relaxed pick is stored with `Relaxed` and its chip; a kept relaxed pick is replaced after a strict Recipe is added; `Alternatives` for the Side offers relaxed ones last; an optional Course with nothing fitting stores nothing and no reason; Course Attendance changes (a Member opting out of the Dessert) replan the portions.

## 7. Tests, and what each is for

All in package `planner` unless marked. `courses_helpers_test.go` has the cell helpers (`cell`, `mainCell`, `isOptional`, `optedOut`, `courses`, `whole`, ...).

| File | Covers |
|---|---|
| `courses_test.go` | Course fit (fresh, Leftover, not tied to the cooking Course, Course 0 shim); walk order (main first, required in slot order, optional last, chronological, duplicates); Whole meal covering (fresh, Leftover, Pinned, kept removed, non-main, no main, fixed meal beside it, covered again, no reason without Recipes); one Recipe per slot; `no_course_recipes`; optional Courses; Course Attendance (portions, Exclusion, Favourites, Dislikes, Leftover size, nobody eats, slot nobody attends); Leftover first both rules; Cool-down/recency/Variety across Courses; reservations per cell; jitter per Course. |
| `soft_test.go` | relaxed fill; every relaxed-order key (one subtest each); chips (Cool-down, Variety, parameters, last); Exclusions and Advance Steps never relaxed; hard-first counting; Pinned wins in both cases; `best_available` gone; five Recipes over seven days; determinism; Swap strict then relaxed. |
| `keepcheck_test.go` | the keep check: replace vs keep, own cook left out, every kept meal, dropped meal leaves history, Regenerate/Pinned/Leftover meals, one Recheck per kept fresh meal. |
| `internal/plan/courses_test.go` (`plan_test`) | `BuildInput` cells, Course Attendance, `AllOptedOut`, shim, per-cell past rule, Course-0 normalisation, rules per Course, keys with Course, `Reconcile` keys, Rechecks, `no_course_recipes`, `ClearUnfilled` per cell. |

**Existing tests changed** (new spec, not new features): `unfilled_test.go` (the mixed-filter case now counts hard filters only; a new case shows the soft ones fill), `reserve_test.go` (three tests whose Couldn't plan became relaxed picks: Pinned wins, LastPlanned inside Cool-down, two rules for one Recipe), `swap_test.go` (two cases gain relaxed alternatives), `why_test.go` (no `best_available`), `internal/plan/plan_test.go:93-94` (a `leftover` chip instead of `best_available`), and the unkeyed `SlotKey{...}` literals in six test files became keyed (the struct gained `CourseID`).

## 8. Gaps and decisions the Reviewer should look at

1. **Optional Course on a slot nobody attends.** Spec §7.4 says reasons are for required Courses and §7.2 says `no_attendance` is recorded for each Course of a slot nobody attends. Decided: optional cells get no reason (`NotServedOptional`). Test: `TestOptionalCourses`.
2. **Kept optional meal that breaks a soft rule with no strict candidate.** The keep check says "otherwise it stays, relaxed"; ADR 0008/0009 say optional Courses are never filled by a relaxed pick. Decided: it is dropped (not relaxed). Test: `TestOptionalCourses` (kept optional).
3. **`Relaxed` for a pick that only gave up a reservation.** The spec does not say. Decided: not relaxed, no chip (the chip is always a fact about the rules the Household sees). Test: `TestRelaxedOrder` "a reserved Recipe is the last resort".
4. **Hard filters "one Recipe per slot" and "Whole meal held back" in the counts.** The spec lists only Exclusion and Advance Step as counted. Decided: they count in `Considered` and in no column, so the cell is the "No fit" cause. Test: `TestOneRecipePerSlot`.
5. **`no_course_recipes` with zero Recipes at all.** A Household with no Recipe now sees "No Recipes for this Course" (Course ≠ 0) instead of "No Recipes"; the "No Recipes" cause remains for Course-0 cells and for Recipes all removed by the Slot Rule. This follows §7.2 literally.
6. **`Variety` chip `Value`** is the count including this cell ("3rd fish"), `Date` the earlier adjacent cook; **Cool-down chip `Date`** for equally near cooks is the earlier. Not in the spec; the SPA phrases "also on Thu"/"had Tue" from the date relative to the cell.
7. **The Whole meal "no Side" Swap chip** is not a planner chip (the SPA derives it from `WholeMeal`); if F wants it from the planner, it is a follow-up.
8. **Runner tests** wait for team A's store (see §6).
9. **RX (Couldn't plan "Review Exclusions")** is not built; §2 step 5 keeps all Exclusion counting in `tally`/`countExclusion` so B-RX has one place to extend.
