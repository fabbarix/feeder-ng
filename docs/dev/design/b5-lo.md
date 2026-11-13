# B5-LO: Leftovers by hand (backend)

Team LO, beta.5. Test-first note by the designer / test author. Sources: [beta5-plan.md](beta5-plan.md) 2.3,
[beta5-reconcile.md](beta5-reconcile.md) §3, §9, §12 (LO row), §13 (U4, U5), [ADR 0012](../../adr/0012-leftovers-stay-leftovers.md),
[ADR 0003](../../adr/0003-stock-lots-deducted-on-cooked.md) (Stock is deducted only on Cooked; a Leftover meal deducts nothing),
ADR 0008. The web is team LOW's, later. The branch is based on `team/b5-sd`; the developer starts after team BO merges.

The terms are the [GLOSSARY](../../../GLOSSARY.md): **Leftover**, **Use-by**, **Frozen Use-by**, **Had it / Threw it out / Freeze it**,
**Storage Place**, **Zero-waste streak**, **Pinned**, **Planned Meal**.

## 1. Where the rules live

| Piece | File | State after the test commit |
|---|---|---|
| Migration 1510 | `internal/db/migrations/1510_leftovers_by_hand.sql` | **Written** (the DDL is the plan's; its tests are green) |
| Pure rules | `internal/plan/leftover.go`: `LeftoverAnswer`, `LeftoverEvent`, `StoragePlace`, `ErrPortionsInvalid`, `Leftover.Frozen`, `FreezeUseBy`, `TakeOutUseBy`, `IsToAnswer`, `Plannable`, `ThrownOutOn`, `CheckPortions`, `SplitForFreeze`, `PlannedClaims`, `MisfitDependants` | stubs |
| Leftover fields | `plan.Leftover.StoragePlaceID`, `FrozenOn` (`plan/types.go`) | fields added, nothing fills them |
| Repository | `internal/plan/store/leftover.go`: `StoragePlace`, `FrozenUseByDays`, `SaveLeftoverState`, `DeleteLeftover`, `DependantsOfLeftover`, `AddLeftoverEvent`, `LeftoverEvents` (+ `leftoverCols`, `scanLeftover`, `AddLeftover` in `store.go` read and write the two new columns) | stubs; `store.go` unchanged |
| Runner | `internal/plan/runner/leftover.go`: `LeftoverViews`, `LosingOut`, `HadIt`, `ThrewOut`, `Freeze`, `TakeOut`, `Answer`, `UseLeftover`, the errors | stubs returning `errLeftoverNotBuilt` |
| Routes | `internal/plan/httpapi/leftover.go` (the five POST routes; `leftoverRoutes` is mounted from `httpapi.go`) | 501 stubs |
| Payload | `leftoverOut`: `storagePlaceId`, `storagePlaceName`, `frozen`, `frozenOn`, `toAnswer`, `plannedPortions` | fields added, not filled |
| Household | `household.Settings.FrozenUseByDays` | field only: not defaulted, not validated, not stored |
| Recipe | `recipe.Input.FrozenUseByDays`, `MaxFrozenUseByDays`, `CodeFrozenUseByInvalid` | field and names only |
| Zero-waste | `internal/cook/zerowaste.go` | **no change needed** (see 2.7); its tests pass today |

## 2. The rules, as decided

1. **A Leftover stays a Leftover** (ADR 0012 point 1). "Frozen" is `frozen_on IS NOT NULL`, never the place's kind: deleting or re-kinding a
   Storage Place changes nothing about a frozen Leftover; with its place deleted (`storage_place_id` goes NULL) it lists with no place and the
   Pantry shows it under "Not sorted" (U4). A taken-out Leftover is a normal Leftover: `frozen_on` NULL, Use-by from today, in the chosen
   non-Freezer place or none.
2. **Use-by.** `FreezeUseBy(today, recipeDays, householdDays)` = today + the Recipe's Frozen Use-by (1 to 365, optional) else the Household's
   (default 90). `TakeOutUseBy` = `LeftoverUseBy` from today (Recipe's Use-by days, else the Household default; 0 is the same day).
3. **To answer** (`IsToAnswer`): available, `portions > 0` and `use_by < today` (household date). Frozen or not. Still good on its Use-by day.
   `Plannable` = available, portions left, not frozen, not to answer. `plan.BuildInput` feeds the planner only `Plannable` Leftovers, with
   "today" taken in the snapshot's zone. A frozen Leftover therefore appears in a plan only when a User picks it (rule 6).
4. **No automatic waste.** The 03:00 job plans and discards nothing. `Runner.DiscardExpired` and `plan.ExpiredLeftovers` are no longer used
   (remove them, `Summary.Discarded` stays 0). Upgrade: Leftovers that went past their Use-by since the last 03:00 job are simply to answer.
   A Pinned Planned Meal served from a Leftover that is to answer stays Pinned and served from it (the User chose it; its Reheat still consumes
   portions). Nothing unpins it until the Leftover is answered or runs out.
5. **Dates of waste** (`ThrownOutOn(answer, useBy, today)`): Had it and Wasn't there are never waste. Threw it out is waste dated **today**,
   except for a Leftover already past its Use-by (`use_by < today`), which is dated **Use-by + 1** (like a Lot going off, spec 6.1). The same
   rule applies to the Threw it out action and to the answer, so a Leftover cannot be dated two ways. Waste is a `stock_waste` row (reason
   `leftover_discarded`, `ingredient_id` NULL, `quantity` = portions) through the existing `StockPort` (`LeftoverWaste{LeftoverID, RecipeID,
   Portions, On}`), inside the action's transaction when the port is a `TxWaster` (then the runner publishes `stock {"changed":"waste"}` after
   the commit, as `DiscardExpired` did), else after the commit.
6. **Actions** (each is one `Runner.write` with `ReasonLeftoversChanged`, so the horizon is replanned and `plan` is published):
   - **Had it** `HadIt(id, portions, userID)`: `0 < portions <= left` (`plan.CheckPortions`, else `ErrPortionsInvalid`); portions go down, no
     waste; event `had_it`. A Leftover with 0 portions is no longer listed (the row stays).
   - **Threw it out** `ThrewOut`: as Had it, plus the waste of rule 5 (portions = those thrown); event `threw_out`.
   - **Freeze it** `Freeze(id, placeID, portions *float64, userID)`: refused when the Leftover is frozen (`ErrLeftoverFrozen`), past its Use-by
     (`use_by < today`, `ErrLeftoverPastUseBy`; on the Use-by day it is allowed), the place does not exist or `placeID` is 0
     (`ErrUnknownStoragePlace`) or is not a Freezer (`ErrStoragePlaceNotFreezer`), or the portions are bad. Freezing all of it updates the row:
     `storage_place_id`, `frozen_on = today`, `use_by = FreezeUseBy`. Freezing part (`SplitForFreeze`) leaves the **original id** with the part that
     stays (same Use-by, same claims, not frozen) and inserts a **new row** (new id) for the frozen part: same Recipe, source, cooked date, status;
     frozen in the place with the new Use-by. Event `froze` is written for the frozen part's id, with its portions and the place.
   - **Take out** `TakeOut(id, placeID, userID)`: only a frozen Leftover (`ErrLeftoverNotFrozen`); `placeID` 0 is Not sorted, else a non-Freezer
     place (`ErrStoragePlaceFreezer`, `ErrUnknownStoragePlace`); `frozen_on` NULL; Use-by = `TakeOutUseBy(today, recipe Use-by days, default)`
     whatever the old Use-by was. Event `took_out` (all the portions).
   - **Answer** `Answer(id, answer, userID)`: `ErrInvalidAnswer` for anything but the three words; `ErrLeftoverNotToAnswer` unless
     `IsToAnswer`. Had it: portions to 0; Threw it out: portions to 0 and waste; Wasn't there: the row is **deleted** (`planned_meals.from_leftover_id`
     goes NULL by the foreign key). One event each (`had_it`, `threw_out`, `wasnt_there`) with the portions that were left.
   - **Events** (`leftover_events`): `on_date` is the household date of the action, always today (not the waste date); `user_id` is the acting User;
     the table outlives the Leftover.
   - **Planned Meals that lose out.** After Had it, Threw it out, Freeze it and an answer, the Planned Meals (State planned, Pinned or not) served
     **from that Leftover id** are checked in the order they are served (`plan.MisfitDependants(remaining, deps)`; `remaining` = what stays
     unfrozen on the id); each misfit is **unpinned** and planned again by the replan, and returned as `Replanned` in that order. Dependants are
     found with `Store.DependantsOfLeftover(id)` (by `from_leftover_id`), **not** `Store.Dependants(sourceKey)`: after a split the two parts share the
     source key. `Runner.unpinMisfits` keeps working on source keys for Cooked and Not cooked; the Leftover actions use the by-id variant.
     `Runner.LosingOut(id, remaining)` is the same computation without a write, for the sheets and `?dryRun=1`.
7. **Zero-waste streak** (`cook.ZeroWasteStreak`): it already reads `stock_waste` by `wasted_on`, so it needs no change. An answered Threw it out
   dated Use-by + 1 drops the streak back to that day; an unanswered Leftover has no row and counts nothing; Had it and Wasn't there write no row.
   `cook/zerowaste_leftover_test.go` and `cook/service/streakinput_leftover_test.go` pin this and pass today by design; the end-to-end proof is in
   the runner tests (dates) and the BDD streak steps.
8. **Picking a Leftover** ("From the freezer" in Choose a Recipe): `PUT /api/plan/{date}/{slotId}/{courseId}` also accepts `{"leftoverId": id}`
   (instead of `recipeId`; `Runner.UseLeftover(key, id)`). It pins a Planned Meal `{Recipe of the Leftover, Batches 0, Portions = the cell's,
   From: {LeftoverID: id, From: the Leftover's source}}` after the checks of `SetCourseMeal` (Meal Slot, past, Not served, resolved, Course, Recipe
   in the Course, one Recipe per slot and date) plus: `ErrNotFound`; `ErrLeftoverPastUseBy` when `use_by < the meal's date`; `ErrLeftoverTooSmall`
   when the Leftover's portions minus those the other planned meals already claim are fewer than the cell needs. Picking does not take it out of
   the Freezer.
9. **U5, Cooked from a frozen Leftover.** `Cooked` already consumes the portions the meal needs from its source Leftover (floor 0) and deducts
   no Stock. The rest keeps `frozen_on`, the place and the Use-by; Take out is not required first. No change to Cooked except that
   `scanLeftover`/`SetLeftoverPortions` must not lose the new columns; `LeftoverFrom(key)` (Cooked's fallback source lookup) must prefer the
   unfrozen part when a split gave two Leftovers one source key.
10. **Recipe and Household fields.** `frozenUseByDays` on a Recipe: optional (`null` = the Household's), 1 to 365, `422 validation_failed` with
    `field: frozenUseByDays`, `reason: frozen_use_by_invalid`; absent in a write is `null`; a read always has the key. No Recipe File change
    (decided). Household `frozenUseByDays`: 1 to 365, default 90, Admin; a `PUT /api/household/settings` that does not send it keeps the stored
    value (clients older than beta.5 must neither fail nor reset it), so `settingsIn.FrozenUseByDays` is a `*int`.

## 3. Data model (migration 1510)

As beta5-plan 2.3: `leftovers.storage_place_id` (FK, `ON DELETE SET NULL`), `leftovers.frozen_on`, `recipes.frozen_use_by_days`
(`NULL` or 1..365), `household_settings.frozen_use_by_days` (`NOT NULL DEFAULT 90`, 1..365), table `leftover_events` (`kind` in `had_it`,
`threw_out`, `froze`, `took_out`, `wasnt_there`; no foreign keys) and two indexes. One addition to the plan: `leftovers_storage_place` on
`leftovers(storage_place_id)` (the `ON DELETE SET NULL` scans it).

## 4. API (all Users, CSRF; unauthenticated is 401)

Errors are `{"error": {"code", "message", "field"?, "reason"?}}`.

`GET /api/plan/leftovers` -> `{ "leftovers": [ ... ] }`, soonest Use-by first (frozen and to-answer ones included, portions > 0 only). Each:
`id, recipeId, recipeName, portions, cookedOn, useBy, fromDate, fromMealSlotId, fromCourseId` as today, plus
`storagePlaceId` (int or `null`), `storagePlaceName` (string or `null`), `frozen` (bool), `frozenOn` (date or `null`), `toAnswer` (bool),
`plannedPortions` (number; 0 when nothing is planned from it). Built from `Runner.LeftoverViews`.

| Route | Body | 200 / 204 answer | Errors |
|---|---|---|---|
| `POST /api/plan/leftovers/{id}/had-it` | `{ "portions" }` | `{ "leftover": L, "replanned": [R] }` | `404 not_found`, `422 portions_invalid` (also for a missing `portions`) |
| `POST /api/plan/leftovers/{id}/threw-out` | `{ "portions" }` | as above | as above |
| `POST /api/plan/leftovers/{id}/freeze` | `{ "storagePlaceId", "portions"? }` | `{ "frozen": L, "left": L \| null, "replanned": [R] }` | `404`, `409 leftover_past_use_by`, `409 leftover_frozen`, `422 storage_place_not_freezer`, `422 storage_place_unknown`, `422 portions_invalid` |
| `POST /api/plan/leftovers/{id}/take-out` | `{ "storagePlaceId": id \| null }` | `L` | `404`, `409 leftover_not_frozen`, `422 storage_place_freezer`, `422 storage_place_unknown` |
| `POST /api/plan/leftovers/{id}/answer` | `{ "answer": "had_it" \| "threw_out" \| "wasnt_there" }` | `204` | `404`, `409 leftover_not_to_answer`, `422 validation_failed` (`field: answer`, also when missing) |
| `PUT /api/plan/{date}/{slotId}/{courseId}` | `{ "leftoverId" }` | the Planned Meal as today (`servedFromLeftover.leftoverId` set) | the existing codes, plus `404 not_found`, `409 leftover_past_use_by`, `422 leftover_too_small` |

`L` is the Leftover shape above (after the action); `R` is the existing `plannedForOut` (`date, mealSlotId, mealSlotName, courseId,
recipeName`) naming a Planned Meal that lost its portions (the recipe is the Leftover's). `replanned` is a list, never `null`.
`?dryRun=1` on `had-it`, `threw-out` and `freeze` writes nothing and answers `{ "replanned": [R] }` for the same body (the sheet names the meals
before confirming; proposed, question 3). Each write publishes `plan {"changed":"plan","reason":"leftovers_changed"}`; waste also `stock
{"changed":"waste"}`. `GET`/`PUT /api/household/settings` gain `frozenUseByDays`; Recipes `frozenUseByDays` (rule 10).

## 5. Runner API

```go
LeftoverViews(ctx) ([]LeftoverView, error)                       // + StoragePlaceName, ToAnswer, PlannedPortions
LosingOut(ctx, id, remaining float64) ([]plan.Key, error)        // no write
HadIt(ctx, id, portions, userID) (LeftoverResult, error)         // Leftover, Replanned
ThrewOut(ctx, id, portions, userID) (LeftoverResult, error)
Freeze(ctx, id, placeID, portions *float64, userID) (FreezeResult, error)   // Frozen, Left *, Replanned
TakeOut(ctx, id, placeID, userID) (LeftoverResult, error)
Answer(ctx, id, answer, userID) error
UseLeftover(ctx, key, leftoverID) (plan.Meal, error)
```

Errors: `ErrNotFound` (existing), `plan.ErrPortionsInvalid`, `ErrLeftoverPastUseBy`, `ErrLeftoverFrozen`, `ErrLeftoverNotFrozen`,
`ErrLeftoverNotToAnswer`, `ErrStoragePlaceNotFreezer`, `ErrStoragePlaceFreezer`, `ErrUnknownStoragePlace`, `ErrInvalidAnswer`,
`ErrLeftoverTooSmall`. `httpapi.writeFieldErr` maps them as the table above. The runner reads Storage Places and Frozen Use-by through
`Store.StoragePlace` / `Store.FrozenUseByDays` (no new `Sources` method, so `fakeSources` is untouched); the Recipe's Use-by days for Take out
come from `Sources.Recipes` (`planner.Recipe.UseByDays`) as Cooked uses them.

## 6. Tests

All new files carry "leftover" in the name or live in a new feature file; no existing test file was edited.

| File | What | State |
|---|---|---|
| `internal/db/leftovers_by_hand_migration_test.go` | columns, ON DELETE SET NULL keeps a frozen Leftover, CHECKs 1..365, events table, history outlives the Leftover | green (migration written) |
| `internal/plan/leftover_test.go` | every pure function, `BuildInput` skipping frozen and to-answer Leftovers, on the household date (Rome) | red |
| `internal/plan/store/leftover_test.go` | columns carried, Freezer deleted, `SaveLeftoverState`, `DeleteLeftover` unlinks, events, `DependantsOfLeftover` after a split, lookups | red |
| `internal/plan/runner/leftover_test.go` | no auto-waste at 03:00 (twice), still asked a day later, planner skips frozen and to-answer but uses an ordinary one, a Pinned meal stays; Had it / Threw it out / Freeze it / Take out / answers (each outcome, events, waste dates, TxWaster and publish, all-or-nothing, refusals); replans below the claims (Pinned and not, the order, "leaves enough" keeps them); part freezing keeps the claims; views; picking; U5 Cooked; `LosingOut` | red |
| `internal/plan/httpapi/leftover_test.go` | the list payload (nulls), the five routes with their codes, `replanned`, `?dryRun=1`, waste rows and the streak through `/api/today/streak`, the pick route | red |
| `internal/household/{settings_frozen_test.go,store/settings_frozen_test.go,httpapi/settings_frozen_test.go}` | default 90, 1..365, stored, a save without the field keeps it, Admin only | red |
| `internal/recipe/{frozen_use_by_test.go,store/frozen_use_by_test.go,httpapi/frozen_use_by_test.go}` | validation, round trip and clear, API field and reason | red |
| `internal/cook/zerowaste_leftover_test.go`, `internal/cook/service/streakinput_leftover_test.go` | the streak contract of rule 7 | green by design |
| `bdd/features/beta5/leftovers.feature`, `bdd/steps_beta5_lo_test.go` | the 11 scenarios of the plan plus Had it too many, a meal that loses its portions, a frozen Leftover's listing, U5 Cooked, Deleting the Freezer, past Use-by cannot be frozen, Had it answer, a Leftover still good cannot be answered. Tag `@b5-lo`: `GODOG_TAGS=@b5-lo go test ./bdd/ -run TestFeatures` | red (19 scenarios) |

## 7. Existing tests the Developer must change (not edited here, to avoid a merge conflict with BO)

- `internal/plan/runner/runner_test.go`: delete `TestNightlyDiscardsExpiredLeftoversRecordsWasteOnceThenPlans`,
  `TestDiscardExpiredUnpinsPinnedDependantsAndSurvivesAWasteRecordingFailure`, `TestDiscardExpiredPublishesStockWasteAfterAnInTransactionWaste`
  (they pin the behaviour ADR 0012 reverses; they still pass until `DiscardExpired` goes). The new runner tests replace them.
- `internal/plan/cook_test.go`: the `ExpiredLeftovers` cases go with the function (or stay if it is kept as dead code; prefer removing it).
- `internal/household/settings_test.go` `TestDefaultSettingsMatchSpec`: `want` gains `FrozenUseByDays: 90` once `DefaultSettings` sets it.
- `internal/plan/store/store_test.go`: `DiscardLeftover` tests, if the method is removed (it may stay: old `discarded` rows exist).

## 8. Notes for the Developer

- `Plannable` is the only filter the planner sees; do not re-implement "to answer" in the planner. Use `plan.Today(now, zone)` in `BuildInput`.
- `Store.Leftovers` keeps returning every available Leftover with portions left, frozen and to-answer included (the list, Pantry and
  `LeftoverViews` need them); `runner/snapshot.go` passes them all to `plan.Snapshot`, and `BuildInput` filters.
- `store.LeftoverFrom(key)` (Cooked's lookup of the Leftover a fresh meal made) must prefer an unfrozen Leftover when a split gave two the same source
  key; `LinkLeftover` only runs at Cooked time, before any split.
- `notify/facts` and `notify/compute.go` read Leftovers through the plan store for the 10:00 Use-by push: frozen Leftovers would push on their
  frozen Use-by and to-answer ones never. Nothing in LO's brief changes them; check with the PM whether a frozen Leftover should push at all (the
  plan says the push is "unchanged", the ADR says no push for unanswered ones).
- Reuse `ReasonLeftoversChanged`. Writes are serialised by `writeMu`; the actions are `r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, mutate)`.
- `sources.go` needs nothing for LO. `stockport.go` `RecordLeftoverWaste(Tx)` already maps to `stockstore.ReasonLeftoverDiscarded` with `WastedOn`.

## 9. Open questions for the PM / user

1. **Take out after the Frozen Use-by passed.** ADR 0012 says Use-by = today + the Recipe's Use-by days. Plan 2.3's edge cases say such a Leftover
   is "to answer at once". Both cannot hold. The tests follow the ADR (a fresh Use-by from today) and say so in a comment; if the user wants the
   edge case, Take out of a to-answer Leftover would keep its old Use-by.
2. **Unknown or missing Storage Place** in Freeze it / Take out: the plan table has no code. Proposed `422 storage_place_unknown`.
3. **`?dryRun=1`** on the three portion actions is not in the plan's table. The sheet must name the Planned Meals "before confirming", so the web
   needs it (or the same list from `GET /api/plan`). Proposed as above; drop it if LOW computes the list itself.
4. **Picking a frozen Leftover** has no route in the plan's table. Proposed: `leftoverId` in the existing `PUT /api/plan/{date}/{slotId}/{courseId}`,
   with `409 leftover_past_use_by` and `422 leftover_too_small` (new codes). A picked Leftover that is *not* frozen works the same way.
5. **Threw it out by hand on a Leftover already past its Use-by** is dated Use-by + 1 (rule 5), not today. The plan only dates the *answer* that
   way; one rule for both avoids a Leftover that can be dated two ways.
6. **Portion steps.** The stepper moves in 0.5; the server accepts any number above 0 and at most what is left (like Cooked's Leftover portions).
7. **Event dates.** `leftover_events.on_date` is the day of the action even for an answered Threw it out (the waste row carries its own date).

## 10. Files outside the brief's ownership that this commit touches

- `internal/plan/types.go`: two fields on `plan.Leftover` (SD's file; needed by every layer, additive).
- `internal/plan/httpapi/httpapi.go`: one line mounting `leftoverRoutes`; `internal/plan/httpapi/shapes.go`: six fields on `leftoverOut`.
- `internal/household/settings.go` and `internal/recipe/recipe.go` are inside LO's ownership (`household/settings*`, `recipe/**`).
