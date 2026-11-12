# B5-SD: a Meal Slot on one date, and Guests (backend)

Team SD, beta.5. Test-first note by the designer / test author. Sources: [beta5-reconcile.md](beta5-reconcile.md) §1, §2, §9, §12,
§13 (U1, U2, U3 = A), [beta5-plan.md](beta5-plan.md) 2.1 and 2.2, [ADR 0014](../../adr/0014-meal-slot-on-one-date.md),
ADR 0008 and 0009, spec decision 37 and §18. The web is team F1's, later.

The terms are the [GLOSSARY](../../../GLOSSARY.md): **Not served**, **Guest**, **Who's eating**, **Time today**, **Attendance**,
**Course Attendance**, **Portion Factor**, **Meal Slot**.

## 1. Where the rules live

| Piece | File | State after the test commit |
|---|---|---|
| Migration 1500 `meal_slot_dates` | `internal/db/migrations/1500_slot_dates.sql` | **Written** (schema from the plan; its tests are green) |
| Pure rules | `internal/household/slotdate.go` (`SlotDate`, `EffectiveTime`, `IsNotServed`, `EmptiesDate`, `PortionsWithGuests`, `ValidateGuests`, `ValidateSlotTime`, `ValidateNotServedChange`, `WhoIsEating`) | stubs |
| Repository | `internal/household/store/slotdate.go` (`SlotDate`, `SaveSlotDate`, `SaveWhoIsEating`, `ServeAgain`); `ClearDateAttendance` also clears Guests | stubs |
| Routes | `internal/household/httpapi/slotdates.go` (`GET`/`PATCH /api/meal-slots/{id}/dates/{date}`) and `meals.go` (`guests` on the attendance routes) | 501 stubs |
| Sources port | `internal/plan/runner/ports.go` `Sources.SlotDate` and `SlotDateDef`; `DBSources.SlotDate` | stub returns the zero value |
| Plan types | `plan.SlotInfo` (`UsualTime`, `Guests`, `NotServed`; `Time` is **effective**), `plan.Changes.RaiseBatches` / `RemoveUnresolved`, `ReasonSlotDateChanged` | fields added, nothing fills them |
| Planner | `planner.Slot.Guests` / `NotServed` / `Portions()`, `NotServedDate`, `Result.Raised`, `BatchRaise` | fields added, ignored |
| Payload | `slotOut.usualTime`, `notServed`, `guests`; `courseOut.unserved` may be `"not_served"` | fields added, not filled |
| Slot-time guard | `internal/household/slottime_guard_test.go` | red |

Everything else (notify, cook, today, shopping, the runner) is read through the effective time and has behaviour tests, no stub.

## 2. The rules, as decided

- **Effective time** = `household.EffectiveTime(usual, row)`: the date's time when set, else the usual one. Nothing else computes it. Readers
  (guard-tested): `plan/runner/snapshot.go` and `actions.go` (through `Sources.SlotDate`), `notify/facts/facts.go`, `cook/service/adapters.go`,
  `shopping/httpapi/wiring.go`. `today` and the board go through facts and the plan view. The guard exempts only the two `ORDER BY ... ms.time`
  uses (`tag/store`, `household/store/batch.go`).
- **Not served** (`IsNotServed(row, override, hasOverride)`): `row.NotServed`, **or** the date has its own Attendance (an override, even empty) with no
  Member **and** `row.Guests == 0` (U1). A date with no override is never "emptied": a slot whose **usual** Attendance is empty stays Couldn't plan
  (`no_attendance`). A date of Guests and no Member is **served** (U3).
- **Emptied date is stored.** `SaveWhoIsEating` with Members set and `EmptiesDate(members, guestsAfter)` also saves `not_served = 1`. That is what
  "Plan Dinner again" (PATCH `notServed:false` -> `Store.ServeAgain`) clears; when the date's override is empty and it has no Guest, `ServeAgain`
  removes the override too, so the usual Attendance applies again. Otherwise it leaves Members and Guests alone.
- **Not served only while no Course is Cooked or Not cooked** (U2): PATCH `notServed:true` (and its dry run) answers `422 slot_started`;
  `BuildInput` ignores `SlotInfo.NotServed` once a Course of the slot has a Cooked or Not cooked Planned Meal, so a started slot is planned as it was.
  Not served is only for today and later: `422 date_past` (the same reason refuses a **time** change on a past date; the spec lists `date_past`
  without saying for which field, see question 2).
- **Guests**: 0 to 20 (`guests_invalid`), one standard portion (factor 1) of **every** Course the slot serves, optional ones included; no
  preferences, no Exclusions (those stay the Attendance's, Members only). `planner.Slot.Portions()` = Σ factors + `Guests`. `AllOptedOut` is
  ignored when `Guests > 0`, so a Course every Member opts out of is served for the Guests; `BuildInput` keeps computing `AllOptedOut` from Members only.
  A cell with no Attendance and `Guests > 0` is planned, with no preferences; with neither it is `no_attendance` as before.
- **Reset to usual Attendance** (`DELETE .../attendance`): drops the date's Members, Course opt-outs **and Guests**; keeps Not served and the date's
  time (decision Q5). A row back to all defaults is deleted.
- **Batches follow portions** (ADR 0014 point 6, one code path for every portion change): an existing fresh Planned Meal, **unpinned or Pinned**,
  whose `Batches x Yield` no longer covers the cell's portions keeps its Recipe and is listed in `Result.Raised` with `Batches = ceil(portions / Yield)`.
  Fewer portions never lower Batches (not listed). Cooked / Not cooked: never. The hard rules still replan (archived Recipe, Exclusion of an
  attending Member). Raised Batches count for Stock, purchases and the pending Leftover like any other. The runner's `invalidOnRead` therefore
  stops clearing a meal for "Batches too few"; it still clears "nobody eats the cell" and broken Slot Rules.
  `plan.Reconcile` turns `Raised` into `Changes.RaiseBatches` (key, Batches, Portions) and does **not** also upsert the kept meal;
  `store.Apply` writes `batches` / `portions` of a planned row, Pinned or not, never of a Cooked / Not cooked one.
- **Not served in the plan**: `BuildInput` marks every cell `NotServed` and drops the slot's unresolved Planned Meals, **Pinned ones too**, from
  `Existing` (a meal whose slot is already over stays, passed as Pinned, as today). The planner leaves the cells empty with
  `NotServedDate` (`unserved: "not_served"`), no reason, no Stock, no Cool-down. `Reconcile` returns them in `Changes.RemoveUnresolved`, which
  `Apply` deletes even when Pinned (the User confirmed the dry-run list first). Old Couldn't plan reasons of those cells are cleared.
  Cooked and Not cooked meals stay as history.
- **Walk by effective time**: `SlotInfo.Time` is effective, so `Slot.At` and the walk order follow it with no planner change (guard test).
- **Replans**: PATCH and PUT publish `household {"changed":"slotDates"}` (PUT guests also `"attendance"`); `plan.ReasonForEvent` maps
  `slotDates` to `ReasonSlotDateChanged`. Reminder keys already end in the due instant, so a moved time gives new keys.

## 3. API shapes (spec §18)

All JSON camelCase, every User, CSRF as today.

`GET /api/meal-slots/{id}/dates/{date}` -> `200`

```json
{ "date": "2026-11-09", "notServed": false, "time": null, "usualTime": "19:00", "guests": 0 }
```

`time` is `"HH:MM"` or `null` (the key is always present). `404` unknown Meal Slot; `422 weekday_mismatch` / validation for a date that is not on the
slot's weekday or not a date (as the attendance routes).

`PATCH /api/meal-slots/{id}/dates/{date}` body `{ "notServed"?: bool, "time"?: "HH:MM" | null }`. Presence-aware: a key that is not sent is not touched
(last write wins per field). `200` answers the GET shape. Errors `422 validation_failed` with `field` and `reason`:

| field | reason | when |
|---|---|---|
| `time` | `time_invalid` | not a 24-hour `HH:MM` |
| `notServed` or `time` | `date_past` | the date is before today |
| `notServed` | `slot_started` | `notServed:true` while a Course is Cooked or Not cooked |

`?dryRun=1` with `notServed:true` writes nothing and answers
`{ "removes": { "plannedMeals": [ { "courseId", "courseName", "recipeName", "pinned", "bought": [ingredientName] } ] } }`, in the slot's Course order,
`plannedMeals` never null. `bought` is always `[]` until team BO lands (the field is there). The same `date_past` / `slot_started` apply to the dry run.
Serving again is `notServed:false`.

`GET/PUT /api/meal-slots/{id}/attendance?date=` gains `"guests"` (0 to 20). `PUT` takes `attendance`, `courses` and/or `guests`; `guests` alone is a valid
save (today a body with neither attendance nor courses is `nothing_to_change`). `portionsNeeded`, both on the date and per Course, **include** the
Guests. `422 validation_failed`, `field: guests`, `reason: guests_invalid`, nothing written. Saving `attendance: []` with no Guest (sent, or already
stored) makes the date Not served. `DELETE` also resets Guests.

Plan, Today, board and the lists (`slotOut`): `time` is the **effective** time, plus `usualTime`, `notServed`, `guests`; `portions` includes Guests; a Course's
`unserved` may be `"not_served"` (with `meal`, `unfilled`, `coveredBy` all null); `mealOut.portions` includes Guests.

Runner: `Sources.SlotDate(ctx, slotID, date) -> SlotDateDef{Time, UsualTime, NotServed, Guests}` (resolved by the adapter through the household
rules); `SlotView` gains `UsualTime`, `NotServed`, `Guests`; `CourseView.Unserved` may be `"not_served"`; `CourseView.Portions` and `SlotView.Portions` include Guests.

## 4. Tests, and what is red

Unit: `household/slotdate_test.go`, `household/store/slotdate_test.go`, `planner/guests_test.go`, `planner/batchesfollow_test.go` (the old table row
"Attendance grew: not enough Batches" of `TestPlanDropsInvalidPlannedMeals` moved there: the meal is now kept and raised, not replanned),
`plan/slotdate_test.go`, `plan/store/slotdate_test.go`, `plan/runner/slotdate_test.go` (fake Sources and the real `DBSources`),
`plan/httpapi/slotdate_shapes_test.go`. Integration: `household/httpapi/slotdates_test.go`, `plan/httpapi/slotdate_test.go`,
`notify/facts` (2 tests added), `cook/service/slotdate_test.go`, `today/httpapi/slotdate_test.go`, `shopping/httpapi/slotdate_test.go`, the guard
`household/slottime_guard_test.go`, the migration test `db/slot_dates_migration_test.go`. BDD: `bdd/features/beta5/slot_dates.feature` (tag `@b5-sd`; run
with `GODOG_TAGS=@b5-sd go test ./bdd -run TestFeatures`) and `bdd/steps_beta5_sd_test.go`.

Golden planner cases of reconcile §12.3: Guests with Course opt-outs (`TestACourseEveryMemberOptsOutOfIsServedForTheGuests`,
`TestACourseSomeMembersOptOutOfCountsTheGuestsToo`), Not served with a Whole meal in the main Course (`TestNotServedWithAWholeMealInTheMainCourse`),
Batches follow portions for an opt-out change and a Guests change (`batchesfollow_test.go`, runner `TestBatchesFollowPortionsWhenAMemberJoinsAKeptMeal`),
an emptied date (`household/store`, `household/httpapi`, `plan/runner` real adapter, BDD).

Green on purpose (regression guards): the migration tests, `TestFewerPortionsNeverLowerBatches` (planner), `TestSlotsAreWalkedByTheirEffectiveTime`,
`TestFactsKeepTheUsualTimeOnOtherDatesAndForGuestsOnlyRows`, `TestASlotNobodyAndNoGuestEatsIsStillNoAttendance`, the runner tests
`TestACourseNobodyEatsWithoutGuestsStaysUnserved` and `TestDBSourcesAnEmptyUsualAttendanceIsNeverNotServed`, and the BDD scenario "A slot with no usual
attendees is still Couldn't plan".

## 5. Developer notes

- `invalidOnRead` (runner/snapshot.go) and `validPlannedFresh` (planner/state.go) are the two places that drop a meal for "Batches too few" today.
- `cook/service/adapters.go` reads `ms.time`: join `meal_slot_dates` (or call the household store) and apply `household.EffectiveTime`, without writing
  `ms.time` again (the guard).
- `shopping/httpapi/wiring.go`: read the effective time and keep SH's `SlotID`, `SlotName`, `CourseName` fields.
- `DBSources.SlotDate` is the only place that calls `IsNotServed` (it has the override in hand).
- The `Unserved` enum in `web/src/features/plan/types.ts` is F1's.

## 6. Questions for the product owner (none blocks the tests)

1. **Reset after an emptied date.** Decision Q5 says Reset to usual Attendance does not touch Not served. An emptied date is stored as Not served, so
   after a Reset it stays Not served until "Plan Dinner again". Tests follow Q5 literally. If Reset should also serve an emptied date again, say so.
2. **A time change on a past date.** Spec §18 lists `date_past` without a field; the tests refuse both `notServed:true` and `time` on a past date (history keeps
   the time it was served at). Changing only the time of a past date would be harmless if you prefer to allow it.
3. **Emptying Who's eating on a slot that has started** (a Course Cooked or Not cooked). U2 only restricts the Not served *action*. The tests make the planner
   ignore Not served on a started slot, so the unresolved Courses are not removed and the usual Couldn't plan applies; the PUT itself is not refused.
