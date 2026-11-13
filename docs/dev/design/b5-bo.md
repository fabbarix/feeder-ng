# B5-BO: Bought Planned Meals, backend

Team BO, beta.5. Test-first note by the designer / test author. Sources: [beta5-plan.md](beta5-plan.md) 2.4,
[beta5-reconcile.md](beta5-reconcile.md) §4, §9 (Q18), §12 (BO row), §13 (U6 = A), [ADR 0013](../../adr/0013-bought-planned-meals-held.md),
[ADR 0009](../../adr/0009-soft-cool-down-and-variety.md), ADR 0008 and 0014. The web is team BOW's, later.

The terms are the [GLOSSARY](../../../GLOSSARY.md): **Bought**, **Pinned**, **Planned Meal**, **Regenerate**, **Swap**, **Scan**, **Tick by
hand**, **Stock Lot**, **Not needed**, **Not served**. Code says `Bought` and `Held`; the words `Locked`, `purchased`, `shopped`,
`committed` are `_Avoid_`.

## 1. What this adds, in one paragraph

A purchase (one Stock Lot added from the Shopping List by a Scan that matched a line, or by a Tick by hand) is attributed to the Planned
Meals it covered. Those Planned Meals are **Bought**: every automatic replan leaves them where they are, as it does a Pinned one. Only
Regenerate, Swap or choosing a Recipe by hand changes them. Undo of the Scan, unticking and Lot Delete remove the records; so do
resolving the Planned Meal, removing it, or changing its Recipe.

## 2. Decisions this note takes (all inside the plan, ADR 0013 and U6; the new ones are marked **new**)

| # | Decision |
|---|---|
| 1 | A Planned Meal is Bought when `planned_meal_bought` has at least one row for it. Only a **fresh, unresolved, unpinned** one is *held* by the planner. A Pinned one with records is Pinned (it shows both facts); Cooked, Not cooked and Leftover-served ones carry none. |
| 2 | **Held = Pinned for the walk** (Stock, Leftover, Cool-down, Variety, Whole meal covering, Batches follow portions) **except** Regenerate treats it as an empty cell and Swap replaces it. |
| 3 | **new (shape).** A held cell is reported in `planner.Result.Kept` (it is an unpinned Planned Meal that Plan left unchanged) and in `Result.Rechecks`. So `Reconcile` and `Apply` need no new path: they already write a kept meal's relaxed flag, chip, portions and raised Batches **in place**, and never list it in `Deletes`. |
| 4 | The relaxed flag and why chip of a held meal are **recomputed** with the keep check's own-cook-left-out rule but the meal is **never dropped** (ADR 0013 point 3). |
| 5 | A Slot Rule reservation never drops a held meal and never reserves around it: it counts in the history like a Pinned one, so the rule cell gets a relaxed pick (ADR 0013 point 4). |
| 6 | **U6.** A held Side beside a Whole meal main is kept; the Whole meal is not a candidate for the main Course ("held back", spec 7.2 step 2); a Whole meal set by hand leaves the held Side uncovered. |
| 7 | A held meal in a Course nobody eats on the date is kept and shown (step 0b), like a Pinned one. Not served for the whole slot still removes it (the dry run named it first). |
| 8 | **Clear does not apply to a held meal.** `plan.BuildInput` ignores `Snapshot.Clear` for it; `plan.existing` marks it `Held` and never lists it in `Clear`, so the runner's `invalidOnRead` never sees it as a candidate (it needs no skip of its own). So Slot or Variety Rule changes, Swap downstream, Cooked downstream and Tag changes keep it. |
| 9 | **new.** When Regenerate re-places a Bought cell, the row is updated **in place** (never delete and insert: the id and so the records survive). The records are removed only when the **Recipe changes** (`SaveMeal` with another `recipe_id`), so a Regenerate that happens to pick the same Recipe leaves it Bought. |
| 10 | **new, Q18 read literally.** `shopping.Attribute` derives the shortfall of every Planned Meal from the same `derivedLines` (past, unconfirmed Planned Meals sit first in date order and absorb Stock), then gives **past meals no share**. Buying exactly the pack a past, unconfirmed dinner needs therefore Bought nobody. See open question 1. |
| 11 | **new.** Shares are per Planned Meal and Ingredient and summed per Lot; one Planned Meal's several lines of one Ingredient are one share. A Planned Meal with `MealID` 0 gets none. |
| 12 | **new.** A failure of the recorder fails the Scan (`AfterLot` returns the error, so the Scan's own undo steps run) and the Tick; a missing recorder (`Ports.Bought == nil`) records nothing. A retried Tick (same `clientUuid`, `created == false`) **records again**: a record is keyed by Planned Meal, Ingredient and Lot, so it is idempotent, and it repairs a first attempt whose recorder failed after the Lot was added. |
| 13 | **new.** Unticking removes the records of the Lot the tick added (`shopping_ticks.lot_id`); a tick set by a Scan has no Lot, and Undo of that Scan owns the records. |
| 14 | `mealOut.bought` is `null` when nothing was bought, else `{ingredients: [{id, name}]}` ordered by name. `mealOut.warning` is `null` or `{code, memberId?, ingredientId?}`, only for an unresolved, fresh, **Pinned or Bought** meal. |
| 15 | `POST /api/plan/regenerate?dryRun=1` answers `{replaces, bought: [{date, mealSlotName, courseName, recipeName, ingredients: [name]}]}` and writes, bumps and publishes nothing. `replaces` counts the unresolved, unpinned Planned Meals whose slot has not passed and is not Not served. `bought` is `[]`, never `null`. |
| 16 | Structural dry runs (Not served, taking a Course off a Meal Slot, Course Delete / Archive impact) list `bought: [name]` per Planned Meal, `[]` when none. The real edit removes the rows and the records cascade. |

## 3. Data model

Migration **`1520_planned_meal_bought.sql`** (written; the migration tests are green). Next free number was 1520 (1500, 1530 on this branch;
1510 is LO's). `Pre1500Prefixes` already lists `1520_`, so the pre-upgrade snapshot rule (`feeder-pre-1500.db`) needs no change.

```sql
CREATE TABLE planned_meal_bought (
    planned_meal_id INTEGER NOT NULL REFERENCES planned_meals(id) ON DELETE CASCADE,
    ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id),
    lot_id          INTEGER NOT NULL,            -- no FK: a Lot used up by a Cooked meal is deleted, the record stays
    quantity        REAL    NOT NULL CHECK (quantity > 0),
    bought_at       TEXT    NOT NULL,
    PRIMARY KEY (planned_meal_id, ingredient_id, lot_id)
);
CREATE INDEX planned_meal_bought_lot ON planned_meal_bought (lot_id);
CREATE INDEX planned_meal_bought_ingredient ON planned_meal_bought (ingredient_id);
CREATE INDEX planned_meals_recipe_cooked ON planned_meals (recipe_id, date) WHERE state = 'cooked' AND from_date IS NULL; -- for 2.7
```

- No backfill (ADR 0013 point 8).
- Why not a trigger on `stock_lots`: `DELETE FROM stock_lots` also runs when a Lot is used up (Cooked, Stock-take), and the record must stay then.
- `planned_meals.id` is AUTOINCREMENT (1100, kept by 1400): ids are never reused, so a record cannot point at a stranger.
- The Ingredient merge mover (`plan/store/bought.go`, registered in `init`) re-points `ingredient_id` and sums records that then share
  `(planned_meal_id, lot_id)`. Deleting an Ingredient with records is refused by the foreign key; the mover's `Count` makes the merge/delete
  protection name them.

## 4. Pieces and where they live

| Piece | File | State after the test commit |
|---|---|---|
| Records, Warning, `HardRuleWarning` (pure) | `internal/plan/bought.go`; `plan.Meal.Bought []int64` and `IsBought()` in `plan/types.go` | `IsBought` real; `HardRuleWarning` stub (nil) |
| Held role in `BuildInput` (`existing()`: Bought and unresolved and fresh -> `Held`, ignoring Clear) | `internal/plan/plan.go` | not touched (tests red) |
| Planner role | `internal/planner/types.go` `ExistingMeal.Held`; `state.go` `roleHeld` | field added, ignored (tests red) |
| Attribute (pure) | `internal/shopping/attribute.go` (`Share`, `Attribute`); `shopping.Meal.MealID` | stub (nil) |
| Recorder port, hooks | `internal/shopping/service/service.go`: `BoughtRecorder`, `Ports.Bought`, `UndoLotInput.LotID`, `ForgetLot` | port and fields added; `ForgetLot` stub; `AfterLot`, `Tick`, `Untick`, `UndoLot` not wired |
| Tick's Lot | `internal/shopping/store/store.go` needs `TickLot(ctx, to, ingredientID) (lotID, ok, err)` | not written |
| Adapter | `internal/shopping/httpapi/wiring.go`: `plans.Meals` sets `MealID: m.ID`; a `boughtRecorder` over the plan store | not written |
| Repository | `internal/plan/store/bought.go`: `AddBought`, `RemoveBoughtForLot`, `BoughtRecords`, `Mover`; `store.go`: `Meals`/`Meal`/`UnresolvedBefore` fill `Meal.Bought`; `MarkResolved` and `SaveMeal` (Recipe change) delete the records | stubs |
| Runner | `snapshot.go` unchanged (Bought is handled in `plan.existing`, not `invalidOnRead`); `actions.go` `View` fills `CourseView.Warning`; `runner/bought.go` `RegeneratePreview` | `Warning` field and `RegeneratePreview` stub |
| HTTP | `internal/plan/httpapi/shapes.go`: `mealOut.Bought`, `.Warning` (types added, never filled); `handlers.go` `regenerate` `?dryRun=1` | dry run answers 501 |
| Structural dry runs | see §9 (files outside the BO list) | no stub: the tests parse JSON themselves |

### Planner details for the Developer

- `classify(i)`: after the `MealPinned` and Not served checks, `m.Held && m.State == MealPlanned && m.From == nil && !st.regen` is `roleHeld`
  (`regen` keeps the existing `roleEmpty`; the Swap target is already `roleEmpty` first).
- Every `switch` that lists `rolePinned` also lists `roleHeld`: `isOpenSlot` (not open), `fixedBeside`, `plannedInGroup`, `servedElsewhere`,
  the Whole meal covering loop, the history pre-seed, `step`.
- `step`: `case roleHeld: st.keep(i); st.applyFixed(i, st.raise(i, *s.Existing))`, so `Result.Kept`, `KeptPortions` and `Raised` carry it.
- Recheck for held cells: after the history is seeded, drop the cell's own cook, `breaks(i, r)`: no -> `Recheck{Key}`; yes -> `Recheck{Key,
  Relaxed: true, Why: relaxedChip(i, r)}`; add the cook back. Never `drop`. `Regenerate` produces none.
- A held cell does not make `AllOptedOut` a `roleNotServed` (that branch only fires for `roleEmpty`, `roleKept`, `rolePlannedLeftover`).

### Shopping details for the Developer

- `Attribute(in, lotID)`: refactor `derivedLines` so one function returns the shortfall per `(meal index, ingredient)` (it already computes
  `s := draw(...)` per meal and line); `derivedLines` sums it, `Attribute` calls it with and without the Lot and subtracts. Keep the stable
  sort by `(Date, At)`. Return only meals with `At` not before `in.Now`, `MealID != 0`, not Leftover, dated up to `in.To`.
- `AfterLot`: after `after := Derive(base)` (Lots restored to the full list) call `Attribute(base, in.LotID)`; if there are shares and a recorder,
  `RecordBought(ctx, lotID, shares, now)`. Do it whether or not the line was on the list (the share is zero when it was not). An extra-only match
  (no plan line) has no share.
- `Tick`: after `AddLot` (whether `created` or not), `s.input(...)` again (the Lot is in Stock), `Attribute`, `RecordBought`. A tick with
  `Quantity == 0` adds no Lot and records nothing.
- `Untick`: read `TickLot` before `DeleteTick`; `ForgetLot(lot)` when there is one.
- `UndoLot`: `ForgetLot(in.LotID)` first (idempotent); `LotID == 0` is a no-op.
- `ForgetLot` is also the hook for Lot Delete (see §9).

## 5. API

```
GET  /api/plan                      meal: {..., "bought": null | {"ingredients":[{"id":7,"name":"chicken thighs"}]},
                                              "warning": null | {"code":"excluded"|"archived"|"course_lost","memberId":2,"ingredientId":40}}
POST /api/plan/regenerate?dryRun=1  200 {"replaces": 3, "bought":[{"date":"2026-11-10","mealSlotName":"Dinner","courseName":"Main",
                                      "recipeName":"Roast chicken","ingredients":["chicken thighs","cream"]}]}
PATCH /api/meal-slots/{id}/dates/{date}?dryRun=1   removes.plannedMeals[].bought: ["chicken thighs","cream"]   ([] when none)
PATCH /api/meal-slots/batch {dryRun}               removes.plannedMeals[].bought
GET  /api/courses/{id}/impact                      plannedMeals[].bought
```

`mealOut` is also the shape of every meal reply (set, confirm, cooked...). `mealFor` fills `bought` from `Meal.Bought` and the names
table (`table.ingredients`); `courseFor` fills `warning` from `CourseView.Warning` (slot views only). Scan and Tick answers are unchanged.

## 6. The pure rule of a warning (`plan.HardRuleWarning`)

Checked in this order, first hit wins: the Recipe is missing or archived -> `archived`; the cell has a Course and the Recipe is not marked
with it -> `course_lost`; an attendee with Portion Factor > 0 excludes the Recipe -> `excluded` (lowest Member id), else one of its
Ingredients (optional lines included; lowest Member id, then lowest Ingredient id). Only an unresolved, fresh, Pinned or Bought meal is checked.

## 7. Test list (all committed; "red" means it fails on the stubs)

| Layer | File | What | State |
|---|---|---|---|
| Migration | `internal/db/planned_meal_bought_migration_test.go` | columns and key, quantity and foreign-key guards, no FK on the Lot, cascade, planned_meals unchanged, last-cooked index | green (the migration is written) |
| Attribute | `internal/shopping/attribute_bought_test.go` | 16 unit cases (earliest first, partial, input order, Stock already had it, shortfall only, per-Ingredient, summed lines, optional, Leftover, range, past slots, same-day slot over, no id, fractions, unknown Lot, ticks/extras ignored, input untouched) and **3 property tests**: shares add up to the drop in the Line (300 random inputs), shares equal an independent prefix-difference oracle including past slots, a Planned Meal is covered only after every earlier one | red |
| Service | `internal/shopping/service/bought_test.go` | Scan records, partial Scan, one Lot each, nothing for an Ingredient nobody needs or an extra, past slot, recorder failure, Tick by hand, Tick with 0, retried Tick records again and repairs a failed first attempt, untick (hand / no Lot / scan tick), Undo with and without `LotID`, `ForgetLot`, no recorder | red |
| Repository | `internal/plan/store/bought_test.go` | add / replace / refuse / atomic, `Meal.Bought`, remove by Lot, cascade on delete, resolve ends Bought, Recipe change ends Bought (row kept), **every in-place update keeps the records and the row id** (same-Recipe save, Apply upsert, raised Batches, Pin, Unpin, SetWhy), Apply Delete, Apply re-place, Pinned and Bought, the mover (count, move, sum duplicates, registered) | red |
| Pure plan | `internal/plan/bought_test.go` | `IsBought`; `BuildInput` holds a Bought meal, ignores Clear for it, holds only fresh unresolved unpinned ones, an over unconfirmed one is Pinned; `Reconcile` keeps a held meal and writes its recheck in place; `HardRuleWarning` (every code, order, who wins, who counts, who is checked) | red where stubs |
| Planner golden | `internal/planner/held_bought_test.go` | held is kept for archived / excluded Recipe / excluded Ingredient / Course lost / new strict Recipe / Variety / Cool-down (each with an unheld **control** that is replaced); nobody eats the Course; Regenerate replaces it, Pinned not; Swap; **equivalence with Pinned for every other cell** (Stock and purchases, Leftover, Cool-down, Variety, Overlap) with a control; raised Batches; the keep check passes over it and the chip is recomputed (4 cases); reservation (vs. the unheld control); Whole meal (U6, 3 cases); `Held` ignored on Pinned / Cooked / Not cooked / Leftover-served; determinism | red |
| Runner | `internal/plan/runner/held_bought_test.go` | 11 triggers (archive, exclusion, rules changed, Variety Rule, Stock-take, new Recipes, Attendance, nightly, startup, Leftovers change, Swap/Pin before, Not cooked before) leave a Bought meal as the same row; control replaces an unbought one; Batches follow portions in place; nobody eating; Regenerate replaces it **in place** and ends Bought; Regenerate leaves Pinned and Bought alone; Unpin keeps it held; choosing a Recipe ends Bought; Cooked / Not cooked end Bought; Not served removes it; a Bought meal is never in `Clear` (`plan.existing`), so `invalidOnRead` keeps it; `RegeneratePreview` (count, names, order, writes nothing, Not served slots); the view's `bought` and `warning` | red |
| HTTP, plan | `internal/plan/httpapi/bought_test.go` | `bought` names by name, Pinned and Bought, `null`s, `warning` for archived / course_lost / excluded Ingredient / excluded Recipe, Pinned gets it, unpinned unbought does not, dry run (shape, nothing written, `[]` not `null`), Regenerate without dry run still regenerates | red |
| HTTP, structural | `internal/household/httpapi/bought_removes_test.go`, `internal/course/httpapi/bought_impact_test.go` | Not served dry run, batch dry run, real removal cascades, course impact, empty lists | red |
| BDD | `bdd/features/beta5/plan-stability.feature` (tag `@b5-bo`), steps `bdd/steps_beta5_bo_test.go` | 21 scenarios: the 10 of the plan plus Tick by hand (and with 0), Not needed, no-need Ingredient, past slot, second pack, Undo of one of two, untick, Slot Rule not satisfied, dry run changes nothing, Pinned and Bought | red |

Every non-pure test was **also run against a throwaway full implementation in a scratch copy of the worktree** (not committed): all of the above
are green there, the whole BDD suite is green, and the only existing test that breaks is
`internal/course/store TestImpactSaysWhatDeleteOrArchiveWouldChange` (see §9, "nil, not empty").

Run only the BO scenarios: `GODOG_TAGS=@b5-bo go test ./bdd/ -run TestFeatures`.

## 8. File list for the Developer

New or filled in: `internal/plan/bought.go`, `internal/plan/store/bought.go`, `internal/plan/runner/bought.go`, `internal/shopping/attribute.go`.
Changed: `internal/plan/plan.go` (`existing`), `internal/plan/store/store.go`, `internal/planner/state.go` (+ `reserve.go` needs no change: held is not
`roleKept`), `internal/plan/runner/actions.go` (`snapshot.go` needs no change: Bought is held in `plan.existing`), `internal/plan/httpapi/{shapes.go,handlers.go}`,
`internal/shopping/{shopping.go,service/service.go,store/store.go,httpapi/wiring.go}`, `internal/stock/{service/service.go,store/store.go}` (Lot Delete, §9.3), `internal/course/{course.go,store/store.go,httpapi/shapes.go}` and `internal/household/...` (structural dry runs, §9.2), `internal/recipe/store/store.go` (`dropLostCourses` leaves a Bought Planned Meal, below). CHANGELOG `[Unreleased]` (developer step): "Planned Meals you
bought Ingredients for stay where they are when the plan changes; Regenerate names them first."

## 9. Needs outside the BO file list (reported to the PM)

1. **`internal/scan/service/service.go`** (two lines): pass `LotID: lotID` to `UndoLot` in the immediate-undo closure of `Apply`, and `LotID:
   derefInt(ev.LotID)` in the `UndoStepList` of `Undo`. Without it the BDD "Undo of the Scan..." scenarios cannot go green.
2. **Structural dry runs** (U-list item "structural dry runs list `bought`"): a `Bought []string` on `household.UnresolvedMeal` and
   `household.RemovedMeal` (`internal/household/{slotdate.go,courses.go}`), on `course.ImpactMeal` (`internal/course/course.go`); filled by one
   LEFT subquery over `planned_meal_bought` JOIN `ingredients` (names, ordered, distinct) in `household/store/{slotdate.go,courses.go}` and
   `course/store/store.go`; served by `household/httpapi/{slotdates.go,removes.go}` and `course/httpapi/shapes.go`. **nil, not empty:** keep the
   domain field `nil` when nothing was bought (`course/store` has a `reflect.DeepEqual` test) and make the JSON layer turn it into `[]`.
3. **Lot Delete** (ST, plan 2.6): the Lot's records are removed by **the stock store, in the same transaction that deletes the Lot**
   (`internal/stock/store/store.go`, test `internal/stock/store/lot_bought_test.go`). There is **no `OnLotDeleted` hook** and no wiring: the
   rows live in the same database, so one transaction is atomic and needs no port. `RemoveLot` (Undo of a scan) needs nothing, the scan
   service already goes through `UndoLot` and `ForgetLot`.
5. **Recipe edits and a lost Course** (`internal/recipe/store/store.go`, `dropLostCourses`; review finding): when a Recipe loses a Course, it
   removes the future, unpinned, unresolved Planned Meals of that Course **except a Bought one** (a Planned Meal with a `planned_meal_bought`
   row). That one stays as the same row with its records; the plan shows it with warning `course_lost` (ADR 0013). Tests:
   `internal/recipe/store/store_courses_test.go` (`...KeepsItsBoughtPlannedMeal...`), `internal/plan/httpapi/bought_test.go` (through
   `PUT /api/recipes/{id}`), BDD scenario "A Recipe that loses the Course keeps a Bought Planned Meal..." in `plan-stability.feature`.
4. **`bdd/steps_beta5_sh_test.go`**: the `@wip` step "the Planned Meal of D is not Bought" (SH) can be removed and its scenario un-parked once
   BO merges: BO's "Not needed is not a purchase" scenario covers it in plan-stability.feature with a real step.

## 10. Open questions for the PM / user

1. **Q18 literal reading (decision 10).** A past, unconfirmed dinner still absorbs Stock first, so buying exactly its pack Bought nobody and
   the line stays open. The alternative (attribute as if past dinners were not on the list) makes the pack Bought the next dinner while the
   list still shows the line open. The plan text ("no share") fits both; this note took the first because it keeps "same derivedLines".
2. **Same Recipe after Regenerate (decision 9).** If Regenerate happens to pick the same Recipe for a Bought cell it stays Bought. Say so if
   it should end Bought on every Regenerate (then the runner deletes the records of every re-placed Bought cell).
