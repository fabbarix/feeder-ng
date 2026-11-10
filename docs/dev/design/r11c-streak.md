# R11c zero-waste streak (design note)

Product rules (spec section 6.1, authoritative): a Lot going off is a waste event on the day it went off (go-off date + 1, the first spoiled day) unless the user chose Keep; a later Throw out of a Lot that had already gone off is not a second event (the streak counts from the go-off day); the streak is capped at the Household's age. With no Lots it is the Household's age. Tests are written first and are red; stubs only.

## What exists today
`cook.Streak(today, lastWaste, since)` takes the newest `stock_waste.wasted_on` and `MIN(stock_lots.purchased)`. Callers: `cook/service` `Board` (via the `Waste` port: `LastWaste`, `FirstActivity`, adapter `dbWaste`) and `today/httpapi` `streak` (via `today.Streak`, which forwards to `cook.Streak`). Gaps: a Lot nobody acts on never resets; a late Throw out resets on the throw-out day; backdated purchases inflate the streak; there is no household creation date (the `household_settings` row is inserted by migration 0100 without a timestamp); and Keep is not recorded (it only moves `goes_off`, so a Kept Lot looks like any other).

## Data (migration `1150_streak.sql`)
- `household_settings.created_at TEXT` (nullable, RFC 3339 UTC). Backfill on upgrade: the earliest of `users.created_at`, `members.created_at`, `stock_lots.created_at` (NULL when none). A fresh install leaves it NULL; `household/store.Created(ctx)` stamps it with the clock on first read (`UPDATE ... WHERE created_at IS NULL`), then returns it. Lazy stamping keeps the fake clock deterministic in tests and needs no hook in sign-in.
- `stock_lots.kept_on TEXT` (household date of the last Keep, NULL = never Kept). `stock.Lot` gets `KeptOn Date`; `store.Update` writes and `scanLot` reads it (`lotColumns`).
- `stock_waste.lot_goes_off TEXT` (the thrown-out Lot's go-off date when it had already gone off unforgiven, else NULL). `store.WasteRecord.LotGoesOff`; `insertWaste` and `Waste` read/write it.
Why a record on the waste row: a thrown-out Lot is deleted, so its go-off date would be lost; one nullable column keeps the history without a Lot tombstone. Existing waste rows keep NULL, so they count on `wasted_on` as before (nothing to backfill).

## Pure function (`internal/cook/zerowaste.go`)
```go
type LotGoOff struct{ ID int64; GoesOff, KeptOn stock.Date }
type WasteEvent struct{ LotID int64; WastedOn, LotGoesOff stock.Date }
type StreakInput struct{ Today, Created stock.Date; Lots []LotGoOff; Waste []WasteEvent }
func ZeroWasteStreak(in StreakInput) int
```
Rules: event days = for each Lot with a go-off date, `e = GoesOff+1`, counted if `e <= Today` and `e > KeptOn` (None sorts first); for each waste record, `min(LotGoesOff+1, WastedOn)` when `LotGoesOff` is set, else `WastedOn`; a Lot whose ID matches a waste record's LotID is skipped (no double count); events after Today are ignored. `ref = max(newest event, Created)`; result `max(0, Today - ref)`; unknown `Created` gives 0. Remove `cook.Streak`, `today.Streak` and the old `streak_test.go` when the callers move to the new function.

## Keep and Throw out (stock service)
- `stock.KeepOn(lot, today) Lot`: `Keep` plus `KeptOn = today` (undated lot unchanged). `service.Keep` uses it; `stock.Keep` stays for its existing tests or is removed with them.
- `service.ThrowOut`: `rec.LotGoesOff = lot.GoesOff` when `lot.GoesOff+1 > lot.KeptOn` (the go-off was not forgiven), else None. (Throw out is only offered for a Lot that has gone off, so a fresh Lot's waste only arrives as `leftover_discarded`, which has no Lot; the pure function still handles a fresh Lot record.)

## Store query and wiring
`cook/service.DB.StreakInput(ctx) (cook.StreakInput, error)` (stub present): `Created` = `hh.Created` converted to a household date in the household zone (`a.zone`); `Lots` = `SELECT id, goes_off, kept_on FROM stock_lots WHERE goes_off IS NOT NULL`; `Waste` = `SELECT lot_id, wasted_on, lot_goes_off FROM stock_waste`. `Today` is left to the caller. Both callers use it: `Board` through a new `Waste.StreakInput(ctx)` port method replacing `LastWaste`/`FirstActivity` (update `fakeWaste` in `cook/service/service_test.go` and `TestBoardStreakFromWasteDates`), and `today/httpapi.streak` through `service.NewDB(...).StreakInput`. Both then call `cook.ZeroWasteStreak` with the household `Today`.

## Go-off survives removal (send-back fix)
Problem: `stock.Deduct` (Cooked) and Stock-take decreases consume the soonest-go-off Lot first, so they use up spoiled Lots first, and `store.UpdateTx` hard-deletes them; the go-off that `StreakInput` read from `stock_lots` vanished and the streak jumped back up.
Delete paths swept: `store.UpdateTx` (every `Update`/`UpdateTx` caller: `SetTotal`, `DeductForCooked` and its Tx variant, `ThrowOut`, `Keep`) and `store.DeleteLot` (`RemoveLot`, Undo of a scan). No other `DELETE FROM stock_lots` exists, and `ingredients` is referenced without cascade, so an Ingredient with Lots cannot be deleted.
Choice: a separate ledger `stock_go_offs(lot_id PRIMARY KEY, goes_off, recorded_on)` in `1150_streak.sql` (unshipped, so no 1151). Not a `stock_waste` row: using up a spoiled Lot by cooking is not waste in quantity terms, and a waste row would show up in `Waste()` lists and reports (and need a fake quantity and reason). The ledger has no quantity and only the streak reads it. `lot_id` is never reused (AUTOINCREMENT), one row per Lot.
Where: in `UpdateTx`, for each Lot deleted by the Mutation. `Mutation.Today` (the household date, set by the service on every Update) decides whether it had gone off: record `{lot_id, goes_off, recorded_on = Today}` when `GoesOff+1 <= Today`, `GoesOff+1 > KeptOn` and no `Mutation.Waste` record carries that LotID (a Throw out counts through its waste record, so no double count). `Today` None records nothing. It runs in the caller's transaction, so Cooked commits or rolls back with the ledger row. A partial deduction keeps the Lot and records nothing; a partly used Lot later Thrown out counts once, through the waste row. `DeleteLot` records nothing (Undo of a scan is a correction).
Reading: `store.GoOffs(ctx)`; `DB.StreakInput` fills `StreakInput.GoOffs []GoOffEvent{LotID, GoesOff}` from `stock_go_offs`; `ZeroWasteStreak` counts each on `GoesOff+1` (ignored after Today, capped by Created like every event). Service: pass `Today: today` in the Mutations of `SetTotal`, `ThrowOut`, `Keep` and `apply` (Cooked). Tests: store (`TestUpdateRecordsTheGoOffOfADeletedGoneOffLot`, not-gone-off/Kept/undated, Kept-then-off-again, no Today, partial deduction, Throw out of a partly used Lot, not waste, rollback, `DeleteLot`), service (Cooked, Stock-take to 0 and decrease, nothing for fine/Kept Lots, Throw out after partial use, `RemoveLot`), `TestStreakInputReadsTheGoOffLedger`, `TestZeroWasteStreak` ledger cases, the migration test, and two BDD scenarios in `today.feature`.

## Files
internal/db/migrations/1150_streak.sql; internal/household/store/store.go (`Created`); internal/stock/lot.go (`KeptOn`, `KeepOn`); internal/stock/store/store.go; internal/stock/service/service.go; internal/cook/zerowaste.go; internal/cook/streak.go (delete); internal/cook/service/{adapters,ports,service}.go; internal/today/{today.go,httpapi/httpapi.go}. Outside the test author's allowance and left for the developer: `internal/today/*` and the household store are touched only by the stub. No web change (the tile renders the number).

## Tests
- `cook/zerowaste_test.go`: `TestZeroWasteStreak` (table: no Lots/age, go-off resets, go-off day itself fine, Keep before/after/again, Throw out of gone-off Lot, no double count, fresh Throw out, discarded Leftover, age cap, backdated, future, month end), `TestZeroWasteStreakUsesTheHouseholdDate`.
- `stock/keepon_test.go`; `stock/store/store_test.go` (`TestUpdatePersistsKeptOn`, `TestWasteRecordKeepsTheLotGoOffDate`); `stock/service/service_test.go` (Keep records the date; Throw out records the go-off date; after Keep it does not).
- `household/store/store_test.go` `TestCreatedIsStampedOnFirstReadAndStays`; `db/streak_migration_test.go` (backfill and fresh); `cook/service/streakinput_test.go` (rows to input, household-zone creation date, no Lots).
- BDD: `notify-ops/today.feature` (go-off reset, Keep, Kept Lot going off again, Throw out no double count, age cap, time zone) and `cook-board/board.feature` (board shows the same rules).

## Open points
- Product question pending with the user: a late Keep (Keep chosen days after the Lot went off) forgives every go-off up to the day of the Keep, so the streak jumps back up ("late Keep forgives forever"). Left as specified until the user decides.
- "Day it went off" is go-off date + 1, matching "still fine on its go-off date"; if the user wants the go-off date itself, change the `+1` in one place.
- Keep leaves a still-past Lot on the spoiled list (existing behaviour); it is forgiven for the streak but prompts again.
- A Throw out of a fresh Lot is not a feature today (409 `not_spoiled`).
