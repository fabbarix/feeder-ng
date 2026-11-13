# b5-ufs: Used from, the stock side

Scope: `internal/stock` only (pure `DeductPicked`, stock service). Sources: [ADR 0011](../../adr/0011-cooked-takes-from-picked-lots.md), [ADR 0003](../../adr/0003-stock-lots-deducted-on-cooked.md), beta5-plan §2.6 (Deduction when Cooked), beta5-reconcile §6, §9 (Q23), §12 (UF-stock). The runner/httpapi team (UF-runner) and the web team (UF-web) build on this contract.

Defaults equal today's behaviour: with no picks, `DeductPicked(lots, need, nil)` equals `Deduct(lots, need)` and `DeductForCookedPickedTx` equals `DeductForCookedTx` (soonest to go off, undated last, ties oldest purchase then lowest id; Storage Places are ignored).

Note on names: the brief and reconcile say `DeductCookedTx`; the existing method is `DeductForCookedTx`. It stays unchanged; the new method is `DeductForCookedPickedTx`.

## Contract

```go
// package stock (internal/stock/picked.go)
type Pick struct { LotID int64; Quantity float64 }          // Base Units
var ErrPickQuantity, ErrPickUnknownLot, ErrPickTooMuch error
func DeductPicked(lots []Lot, need float64, picks []Pick) (DeductResult, error)

// package service (internal/stock/service/usedfrom.go)
var ErrUsedFromInvalid error                                 // errors.Is(err, ErrInvalid) is also true
type IngredientPicks struct { IngredientID int64; Picks []stock.Pick }
type CookedMeal struct { Needs []stock.Need; UsedFrom []IngredientPicks }
type PickedDeduction struct { Deduction; PerMeal [][]Warning }
func (s *Service) DeductForCookedPickedTx(ctx context.Context, tx *sql.Tx, meals []CookedMeal) (PickedDeduction, error)
type PreviewLot struct { LotView; StoragePlaceName string }
type NeedPreview struct {
    IngredientID int64; Name, BaseUnit string
    Need, Have float64
    Lots []PreviewLot; Default []stock.Taken; Shortfall float64
}
func (s *Service) PreviewCooked(ctx context.Context, needs []stock.Need) ([]NeedPreview, error)
```

## DeductPicked (pure)

`lots` are one Ingredient's lots. Picks are taken in the order given, each from its Lot (a pick above `need` is taken as picked). Then the rest, `need - sum(picks)` when above 0, is deducted from what the lots still hold in `Deduct` order (a picked Lot's remainder is eligible). `need <= 0` still takes the picks (batch step A below). `Taken` has one merged entry per Lot: picked Lots first in pick order, then default Lots in consumption order. `Lots`, `Shortfall`, eps rules and input immutability are as in `Deduct`; `Shortfall` is the part of `need` neither picks nor Stock covered.

Refusals (zero `DeductResult`): `ErrPickQuantity` (not a positive finite number), `ErrPickUnknownLot` (the Lot is not among `lots`: unknown, gone, empty, or another Ingredient's), `ErrPickTooMuch` (picks of one Lot, summed, exceed what it holds). The function cannot tell "another Ingredient" from "unknown" because it only sees one Ingredient's lots; the service passes exactly that Ingredient's lots, so both land in `ErrPickUnknownLot`.

## Service: DeductForCookedPickedTx

Same contract as `DeductForCookedTx`: runs inside the caller's transaction, begins/commits/publishes nothing; the caller calls `PublishDeduction(d.Deduction)` after commit. One `CookedMeal` for Mark as Cooked, one per Course for Mark all Cooked (the caller passes them in Course order).

- Resolution as today: unknown Ingredients and non-positive needs are skipped, never blocks on short Stock (Warnings).
- Per Ingredient, in one `store.UpdateTx`: step A validates and takes every meal's picks (`DeductPicked(lots, 0, picks)` per meal; a Lot over-picked across meals is refused because the lots shrink as picks are taken); step B takes each meal's rest `max(0, need - picked)` with `Deduct`, in meal order. The result does not depend on Course order (UF-stock tests cover both orders).
- Two meals needing the same Ingredient are not merged; each keeps its own need and Warning.
- A pick for an Ingredient that is not among that meal's needs (or whose need was skipped as non-positive/unknown) is refused.
- Every refusal returns an error wrapping `ErrUsedFromInvalid` (and so `ErrInvalid`, via `errors.Is`) before anything is written; the caller rolls back. UF-runner/httpapi maps it to `422 used_from_invalid`. Other errors are unchanged.
- `PickedDeduction.Warnings` is the flattened list (meal order, then need order); `PerMeal[i]` is meal i's Warnings (never nil). `Have` in a Warning is the Ingredient's Stock at the start of that meal's step B plus that meal's own picks (so `Have - Need = Shortfall`).
- `ChangedIngredientIDs` lists Ingredients whose Stock changed, once each.

## Service: PreviewCooked

Read-only (no event), for the Cooked sheet. For each need in input order (unknown Ingredient and non-positive need skipped): the Ingredient's `Lots` in default (Deduction) order including Lots that have gone off, each a `LotView` plus `StoragePlaceName` ("" when not sorted, resolved by the service); `Have` the Stock total; `Default` what `Deduct` would take for `Need` (the sheet's preselection, soonest-to-go-off first); `Shortfall` the uncovered part. An Ingredient with no Stock still yields an entry (no Lots, `Shortfall == Need`). The runner/httpapi adds these under `lots` per need (JSON naming is theirs; the cook preview needs `baseUnit` per need and `lots[].{id, quantity, purchased, goesOff, storagePlaceName}`, where `""` means Not sorted).

## Tests (red in this commit)

`internal/stock/picked_test.go` (pure) and `internal/stock/service/usedfrom_test.go` (service, SQLite fixture): defaults equal `Deduct`; picks first in user order; partial pick then default rest; above-need taken as picked; shortfall and warnings per meal; refused picks (unknown, another Ingredient, too much, zero, not in the meal's needs, gone Lot) write nothing and publish nothing; sums across meals; order independence; rollback with the caller's transaction; preview order, default selection, places, shortfall, skips. BDD for the whole flow belongs to UF-runner/httpapi.

## Open points

None blocking. Decision: the HTTP JSON item is `{ingredientId, lots: [{lotId, quantity}]}` (plan §2.6, as the web uses), mapped by the runner/httpapi layer to `stock.Pick`.
