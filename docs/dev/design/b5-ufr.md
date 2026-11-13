# b5-ufr: Used from, the runner and the HTTP layer

Scope: `internal/plan/runner` (Stock port, Cooked, CookedAll, CookPreview) and `internal/plan/httpapi` (shapes, `cook`, `cooked`, `allCooked`, error mapping). Sources: [ADR 0011](../../adr/0011-cooked-takes-from-picked-lots.md), [b5-ufs](b5-ufs.md) (the stock contract this builds on), the web client in `web/src/features/plan/api.usedFrom.ts` and `lib/usedFrom.ts` (team/b5-ufw).

The default is untouched: a request without `usedFrom` (absent, null or `[]`) behaves exactly as today, soonest to go off first, through `StockPort.DeductCookedTx`.

## JSON

Cook preview, `GET /api/plan/{date}/{slotId}/{courseId}/cook`. Each need gains `baseUnit` and `lots`:

```json
{ "needs": [ { "ingredientId": 11, "ingredient": "chicken", "quantity": 300, "baseUnit": "g",
  "lots": [ { "id": 7, "quantity": 250, "purchased": "2026-11-05", "goesOff": "2026-11-11", "storagePlaceName": "Garage Fridge" },
            { "id": 6, "quantity": 200, "purchased": "2026-11-01", "goesOff": null, "storagePlaceName": "" } ] } ] }
```

- `lots` are in default Deduction order (`stock.PreviewCooked`), Lots that have gone off included. `[]`, never `null`, when the Ingredient has no Stock. `goesOff` is `null` when the Lot does not go off. `storagePlaceName` is `""` for Not sorted.
- `baseUnit` is the Ingredient's Base Unit (`g`, `ml`, `piece`) on every need.
- `have`, `default` and `shortfall` of `NeedPreview` are NOT on the wire: the web does not read them (it derives short/exact/over from the picks and the Lots). Adding them later is additive.
- A meal served from a Leftover has no needs, so no lots.

Mark as Cooked, `POST .../{courseId}/cooked`: body `{ "leftoverPortions"?, "usedFrom"?: [ { "ingredientId", "lots": [ { "lotId", "quantity" } ] } ] }`. Quantities are Base Units.

Mark all Cooked, `POST .../all/cooked`: body `{ "courses": [ { "courseId", "leftoverPortions"?, "usedFrom"? } ] }`. Picks are per Course entry; a Course without `usedFrom` (or not listed) takes the default.

The responses are unchanged (`warnings` already carry the shortfall).

## Errors

`ErrUsedFromInvalid` maps to `422 used_from_invalid` (no `field`). It covers: an unknown or empty Lot, a Lot of another Ingredient, an Ingredient not among the meal's needs, a quantity that is not a positive number, more than a Lot holds (summed across the Courses of one Mark all Cooked), and `usedFrom` on a meal served from a Leftover (it has no needs). Nothing is written, published or deducted on refusal. For Mark all Cooked a refusal is not wrapped in a `CourseError` (the whole request is refused).

A malformed body (`usedFrom` not a list, a non-numeric quantity) is the existing `400`.

## Runner

```go
// ports.go
type Pick struct { LotID int64; Quantity float64 }              // Base Units
type UsedFrom struct { IngredientID int64; Picks []Pick }
type CookedMeal struct { Needs []Need; UsedFrom []UsedFrom }     // one Planned Meal
var ErrUsedFromInvalid = errors.New("used from invalid")

// Optional interfaces of the StockPort (type-asserted, like TxWaster); the real StockService implements both.
type PickedDeducter interface {
    // meals in Course order; Deduction.Warnings is the flattened list. Refusals wrap ErrUsedFromInvalid.
    DeductCookedPickedTx(ctx, tx *sql.Tx, meals []CookedMeal) (Deduction, error)
}
type CookPreviewer interface {
    PreviewCooked(ctx context.Context, needs []Need) ([]NeedPreview, error)
}
type PreviewLot struct { ID int64; Quantity float64; Purchased, GoesOff, StoragePlaceName string } // GoesOff "" = none
type NeedPreview struct { IngredientID int64; BaseUnit string; Lots []PreviewLot }
```

- `CookPreview` gains `Stock []NeedPreview` (nil when the Stock port cannot preview or the meal is not Fresh). The handler pairs it to `Needs` by IngredientID.
- `Cooked(ctx, key, leftover)` keeps its signature and delegates to the new `CookedUsing(ctx, key, leftover *float64, usedFrom []UsedFrom)`. Without `usedFrom`: `DeductCookedTx` as today. With it: one `DeductCookedPickedTx` call with one `CookedMeal`, in the same transaction; `PublishDeduction` after the commit.
- `CourseLeftover` gains `UsedFrom []UsedFrom`. `CookedAll` with no picks anywhere keeps its single combined `DeductCookedTx`. With a pick in any entry it makes ONE `DeductCookedPickedTx` call with one `CookedMeal` per Course that has needs, in Course order (Main first), each with its own needs and picks.
- `usedFrom` for a meal served from a Leftover: `ErrUsedFromInvalid`, before the Stock is touched.
- A Stock port without `PickedDeducter` given picks: `ErrUsedFromInvalid` is not right (it is a wiring bug); return a plain error. Not tested.
- Any error rolls the transaction back as today: meal still Planned, no Leftover, nothing published.
- `StockService` maps `stockservice.ErrUsedFromInvalid` to `runner.ErrUsedFromInvalid` (and `PreviewCooked` rows to `NeedPreview`).

## Handlers

Thin: decode `usedFrom`, map to `[]runner.UsedFrom`, call the runner, `writeErr` maps `runner.ErrUsedFromInvalid` to `422 used_from_invalid`. The `allCooked` error path checks `errors.As(*CourseError)` first, then falls through to `writeErr`.

## Tests (red in this commit)

- `internal/plan/runner/usedfrom_test.go`: default path unchanged; picked path in the same transaction; refusal writes nothing; Leftover-served meal refused; preview lots; CookedAll with and without picks, per Course order, refusal writes nothing.
- `internal/plan/httpapi/usedfrom_test.go`: preview shape; cooked with and without picks; bad picks 422 with nothing written; allCooked per Course.
- `bdd/features/beta5/used_from.feature` (`@b5-ufr`) with `bdd/steps_beta5_ufr_test.go`.

## Rebase notes

b5-lo changes `actions.go`, the plan httpapi and cook. Tests sit in new files; they use `newEnvWith`/`newCourseEnv` (runner) and `crsc2`/`path`/`wantErr` (httpapi). If b5-lo changes `Cooked`'s signature, `CookedUsing` takes the same extra arguments.
