# beta.8 undo: Undo of a tick takes back the Stock it added

Team **undo**. Decision and rules: [ADR 0019](../../adr/0019-undo-of-a-tick-takes-back-its-stock.md). This note is the plan.

## Problem
Tick a Line by hand (Shop screen, or the Scan screen's To get tab), Undo: the Line unticks, the Lot the tick added stays. `Untick` says so in its comment. Undo of a Scan removes its Lot (`scan.Service.Undo`, step `lot`), so the two disagree.

## Design (server)
`DELETE /api/shopping/ticks` and `DELETE /api/shopping/extras/{id}/tick` keep their shape (204 and the extra). Behaviour:

1. `Untick` reads the tick's `lot_id` and `lot_quantity` (what the tick added).
2. `Ports.Stock.TakeBack(lotID, added)` -> `TakenBack{Taken, Removed}`. The real adapter calls the Stock service `TakeBackLot`, which runs `stock.TakeBack` inside one `store.Update` transaction (read, reduce or remove, write), publishes one `stock` event when something was taken.
3. If `Removed`, `ForgetLot` (planned_meal_bought records); if the Lot only shrank the records stay.
4. The tick row is deleted last, so a Stock failure leaves the tick for a retry. `TakeBackLot` records the take-back (`stock_lot_take_backs`) in its transaction and answers a repeat for the same Lot with the first result without changing Stock, so a retry after `ForgetLot` or `DeleteTick` failed takes nothing twice.
5. `UntickExtra` does the same through two new columns on `shopping_extras` and takes `Taken` off `got` in the same statement that clears the tick (`UntickExtraTakenBack`) so the extra shows its full quantity again.

Cases (all in `stock.TakeBack`, pure): untouched -> removed; partly used -> what is left, removed; edited up or topped up -> only `added` goes; edited down -> removed; unknown Lot -> no-op; `added <= 0` -> no-op; float rest <= 1e-9 counts as gone. A scan's tick (no Lot) and a tick of 0 change no Stock. Second untick, or none: no-op (no tick row). Retried tick (same client id, `created:false`): same Lot, one take-back.

`stock.TakeBack(lots []Lot, lotID int64, added float64) TakeBackResult{Lots []Lot; Taken float64; Removed bool}`; input never mutated.

## Migration 1560_tick_lot_quantity.sql
`ALTER TABLE shopping_ticks ADD COLUMN lot_quantity REAL;` and `ALTER TABLE shopping_extras ADD COLUMN tick_lot_id INTEGER; ADD COLUMN tick_lot_quantity REAL;` (ticks made before the upgrade have a lot_id and NULL quantity: treat NULL as "the Lot's whole current quantity", i.e. `added = +Inf`, so old ticks undo as before this change would have wished; extras before the upgrade have no Lot: nothing is taken). `SetTick` and `TickExtra` store them; `TickLot` returns `(lotID, quantity, ok)`.

## Web
No domain change. `useShoppingActions.untick` and `untickExtra` also invalidate `['stock']` (Stock changed), so Pantry and Plan numbers refresh. Copy: nothing in the UI, GLOSSARY or spec says the Stock stays, so no copy changes; the toast "<Line> ticked" with Undo is now true for Stock too. GLOSSARY **Tick** (add if absent: "Undo of a Tick takes back the Stock it added") and spec §7 Bought sentence need no edit.

## Files the developer may touch
- `internal/stock/lot.go` (or new `internal/stock/takeback.go`), `internal/stock/service/service.go` (or new `takeback.go`)
- `internal/shopping/service/service.go`, `internal/shopping/store/store.go`, `internal/shopping/httpapi/wiring.go` (adapter `TakeBack`), `internal/shopping/httpapi/httpapi.go` only if needed
- `internal/db/migrations/1560_tick_lot_quantity.sql` (new)
- `web/src/features/shop/hooks/useShoppingActions.ts`
- `GLOSSARY.md` (Tick note), `docs/dev/design/b5-bo.md` row 13 wording, `docs/dev/design/t13-shopping-scan.md` line on untick
Not the tests listed below.

## Tests (written first, failing)
- `internal/stock/takeback_test.go` (domain), `internal/stock/service/takeback_test.go`
- `internal/shopping/service/untick_undo_test.go` (+ `fakeStock.TakeBack` in `fakes_test.go`)
- `internal/shopping/httpapi/untick_undo_test.go`
- `bdd/features/scan/undo_takes_back_stock.feature` (uses existing steps only)
- `web/src/features/shop/hooks/useShoppingActions.undo.test.tsx`

## Commands that should go green
```
go test ./internal/stock/... ./internal/shopping/...
go test ./bdd -run 'TestFeatures/.*(Undo_of_a_tick|Three_ticks|Undoing_a_second|tick_by_hand)'
cd web && pnpm vitest run src/features/shop src/features/scan/hooks/useToGetTick.test.tsx && pnpm tsc --noEmit -p .
```
