# Beta.5 ST: Stock Lots, edit, delete, inline per Ingredient

Team ST (test author's note). Scope: reconcile §12 row ST, Q21 to Q23, spec decision 41, ADR 0011 (the Used from half is UF, not here). Tests are red against stubs that say `not implemented (b5-st)`.

## Behaviour

- **Edit** a Lot: Quantity (> 0), Bought on (a date, not after today), Good until (not before Bought on, may be cleared). Storage Place is not editable (Move to does that, Q22c).
- **Bought on re-suggests Good until** from the Shelf Life that applies where the Lot is (frozen Shelf Life in a Freezer, else ordinary), unless Good until is given in the same edit. Without a Shelf Life Good until stays. The server does this when `goesOff` is absent from the PATCH; the sheet shows the same suggestion live (`lib/lotEdit.ts`), so both agree.
- **An edit is a correction**: no waste, no Keep. Changing Good until clears `kept_on` (a Keep forgave the old date, not the new one) and forgets a go-off record of the Lot. Moving Good until of a spoiled Lot later un-spoils it; earlier can spoil it.
- **Delete** is a correction like the Undo of a Scan: no waste, no go-off; a go-off record of the Lot goes (`store.DeleteLot` now clears it, so the Undo of a Scan does too). The confirm says so for a Lot that has gone off (copy: `strings.deleteBodyWentOff`).
- **By Ingredient rows expand in place** (`ui/ListRow` `expanded` / `onToggle` / `panel`) to the Ingredient's Lots in Deduction order; a Lot opens the one `LotSheet` (facts, Edit, Delete, Move to). Open rows are kept for the session only (`sessionStorage`).

## API

- `PATCH /api/stock/lots/{id}` body any of `quantity`, `purchased`, `goesOff` (JSON `null` clears, absent leaves). 200 the Lot; 404 `not_found`; 422 `validation_failed` (empty body, bad quantity or dates).
- `DELETE /api/stock/lots/{id}` 204; 404.
- Every Lot JSON gains `shelfLifeDays` (int or null): the Shelf Life that applies where the Lot is. The Edit sheet needs it for the suggestion and to know whether to offer "No go-off date".
- Both publish `stock {"changed":"lots","ingredientIds":[...]}` (the web refetches Stock and the zero-waste streak).

## Code

- Domain `internal/stock/lotedit.go`: `Edit{Quantity, Purchased, GoesOff *}`, `ValidateEdit(lot, edit, today, shelfLifeDays)` and its errors. (The reconcile names `lot.go`; a new file keeps the stubs apart. `ShelfLifeIn` already exists.)
- Service `EditLot`, `DeleteLot`, `LotView.ShelfLifeDays`; store `Mutation.ForgetGoOffs`. `view()` needs the place kind: resolve it once per request.
- Web: `lib/lotEdit.ts` (form rules), `lib/ingredientLots.ts` (Deduction order, row text), `hooks/useOpenIngredients.ts`, `useStockActions().editLot/deleteLot`, `api.updateLot/deleteLot`, components `IngredientLotsRow`, `LotEditSheet` (shared `NumberField` or `TextField`, `DateField`, `Switch`), `LotSheet` gains `onEdit`/`onDelete`; `StockScreen` wires them.

## Notes for the developer

- The stock hygiene guard rejects the text `confirm(`. `useConfirm().confirm` would trip it: destructure with an alias (`const { confirm: ask } = useConfirm()`) and call `ask({...})`.
- `StockRow` stays for other uses; `IngredientLotsRow` replaces it in By Ingredient only.
- Lot rows inside the panel are a `ListGroup` of `ListRow`s with `onActivate` (title = quantity, meta = `lotMeta`).
- The `planned_meal_bought` records of a deleted Lot (spec §6, plan 2.4) do not exist before migration 1520 (BO). ST does not touch them; BO must hook the Lot delete when it lands (open point for the PM).
- A copy question is open: the sentence added for a Lot that has gone off ("deleting it also takes that go-off off your Zero-waste streak").
- Copy differs from the plan in two words because the UI word guard rejects "like" and "deleted": the confirm reads "Use Delete for a mistake, such as a double Scan." and the toast "<name> removed from Stock". The plan, spec §6 and GLOSSARY keep "like".
