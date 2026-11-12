# Cooked takes from the Stock Lots the User picks, else soonest to go off first

Status: **Proposed** (2026-11-12). Amends [ADR 0003](0003-stock-lots-deducted-on-cooked.md). No open question: the Storage Place and order points are decided (Q23, [beta5-reconcile.md](../dev/design/beta5-reconcile.md) §9).

ADR 0003 says a Cooked Planned Meal deducts Stock from the Lot that goes off soonest, then the oldest. That is still the default (`stock.Deduct`, `consumptionLess`: soonest go-off date, then oldest purchase, then lowest id). The Household sometimes cooks with another Lot than the one Feeder would take (the open pack, the one from the Garage Freezer they just thawed), and Stock then drifts from the shelf.

## Decision

1. **Default unchanged.** Without a pick, deduction is exactly ADR 0003's order, for every Course.
2. **Used from.** The Mark as Cooked sheet and the Mark all Cooked sheet (per Course) offer a collapsed **Used from** row. The User may pick, for each required Ingredient line of that Planned Meal, the Lots and amounts actually used. Confirming deducts the picked amounts first, then any rest of the need in the default order. A picked amount above the need is taken as picked.
3. **Validation.** A pick naming an unknown Lot, a Lot of another Ingredient, an Ingredient not in the Recipe, or more than the Lot holds (summed across the Courses of one Mark all Cooked) is refused (`422 used_from_invalid`); the sheet reloads the Lots. Mark as Cooked still never blocks on short Stock (decision 4).
4. **Storage Places.** Each Lot is listed with its Storage Place. The default order does not look at places (decided: a Lot in a Freezer already sorts late through its longer go-off date).
5. **Nothing else about Lots changes.** The go-off record, Keep, Throw out and the Bought records are untouched by a pick.

## Considered options

- *Only the default order* (status quo): Stock drifts silently whenever the cook used another Lot. Rejected as the reason for the change.
- *Choose a Lot at Scan time*: wrong moment; the cook decides at the stove.
- *A per-Ingredient "use first" flag*: another setting to maintain; it does not say which Lot a given meal took.

## Consequences

- Pure `stock.DeductPicked(lots, need, picks)` next to `Deduct`; `DeductCookedTx` accepts picks per Planned Meal; the cooked routes gain `usedFrom`; the cook preview lists Lots per need in default order.
- Spec §6 (Deduction), §8 (Mark as Cooked step 1) and a new numbered decision; GLOSSARY **Used from** and **Cooked**.
