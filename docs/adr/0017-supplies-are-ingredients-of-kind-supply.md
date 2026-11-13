# Supplies are Ingredients of kind supply

Status: **Accepted** (2026-11-13; the user's answers D1 to D8 in [household-items.md](../dev/design/household-items.md) §9, all decided by the user). To ship in beta.7 (D8). Design: [docs/dev/design/household-items.md](../dev/design/household-items.md). Spec: [functional-spec.md](../spec/functional-spec.md) decision 49, folded into §5, §6, §9, §10 and §13.

The user asked to track the buying of things that are not ingredients but household items whose prices and stock the Household wants to follow: dish soap, toilet paper, bin bags, batteries, laundry pods. They are bought at Shops, scanned by barcode, priced and kept in Stock as Stock Lots; they are never used by a Recipe, the planner, Exclusions, Cook Mode or Cooked. The term is **Supply** (D1; "item", "household item" and "non-food" are _Avoid_ words). Making an Ingredient non-food and changing "a Product supplies exactly one Ingredient" is a decision several teams share, so it is recorded here as ADR 0015 did for Base recipes.

## Decision

1. **A Supply is an `ingredients` row with `kind = 'supply'`.** `ingredients.kind` is `food` (the default, every existing row) or `supply`; `ingredients.restock_level` is a positive number of Base Units or null. Products, barcodes, Shop Barcodes, Prices, purchases, Stock Lots, Storage Places, ticks, Not needed, extras and scan events keep their `ingredient_id` and change in no way, so Scan, Stock-take, pack suggestions, the estimate, live updates and offline sync work for a Supply as they do for food.
2. **Food-only paths refuse a Supply at the store, not only in the UI** (`422 ingredient_is_supply`): a Recipe line, a Ready Meal's or Base recipe's Ingredient (`supply_name_taken` when only the name is the clash), an Exclusion, an Import Review match, and a merge across kinds (`blocked: "kind_differs"`). The planner, Cooked, Cook Mode, the Recipe File and the streak need no change, because a Supply never reaches them; a regression test pins that.
3. **A Supply has no Shelf Life and no Frozen Shelf Life** (`422`), so its Lots never get a go-off date, never appear in Use soon or Spoiled, and never touch the Zero-waste streak or the "Stock about to spoil" notification.
4. **Names stay unique across both kinds** (`name_key UNIQUE`), so one name means one thing in Scan, search and import. A Supply "Vinegar" blocks a food "Vinegar".
5. **The kind can change only when nothing food-only refers to the row.** To a Supply it is refused (`409 kind_in_use` with the reasons) while the Ingredient is on a Recipe line (a Ready Meal's Ingredient is such a line), has an Exclusion or belongs to a Base recipe; otherwise its Shelf Life, Frozen Shelf Life and its Lots' go-off dates are cleared. To food it is always allowed and the Restock level is cleared. Recorded go-offs and waste stay history.
6. **A Supply's Restock level adds a Shopping List Line from today's Stock**, independent of the plan and the range: a Supply with level L and Stock S < L has a Line of L − S, in whole packs of the Product last bought. A Restock level on food is refused (`422`, D3): a food level would have to combine with the plan's need and is a separate decision.
7. **A Supply's Lot is Used up, not thrown out.** Used up (whole or part) is an edit or delete of the Lot with no waste record; it needs no new endpoint. There is no Today tile, board change or notification for a Supply below its level (D4), and Supplies show beside food in the Pantry by default with a Food or Supplies filter (D6).

## The user's answers (2026-11-13)

- **D1.** The term is **Supply**, plural **Supplies**.
- **D2.** Restock levels are in scope.
- **D3.** Restock levels are for Supplies only, not food.
- **D4.** No Today tile, board change or notification for a Supply below its level.
- **D5.** Supplies have their own catalogue list and pages (Settings > Catalogue > Supplies, `/supplies`, `/supplies/:id`).
- **D6.** Supplies show beside food in the Pantry by default, with a Food or Supplies filter.
- **D7.** Used up is in.
- **D8.** Released as 1.0.0-beta.7, with migration 1550 and the `feeder-pre-1550.db` snapshot.

## Considered options

- *A Product with no Ingredient* (`products.ingredient_id` nullable): needs a table rebuild of `products` and `stock_lots` (the riskiest kind of migration), and Stock, the Shopping List, `shopping_ticks`, Not needed, scan matching and the offline catalogue are all keyed by Ingredient. Two brands of toilet paper would be two unrelated Stocks with no shared total and no shared Line. Rejected (size L).
- *A separate Household Item entity with its own Stock*: new tables for the entity, its Lots, ticks and extras; barcode resolution, Undo, Pantry, Shop and Scan would handle two row types, and Prices and purchases would duplicate or turn polymorphic. It repeats Stock, Scan, Price and Shopping List logic that took beta.2 to beta.6 to settle. Rejected (size XL).
- *Numbering the migration 1600 to dodge the snapshot guard*: it hides the decision. Rejected: the guard exists so each release names its restore point.
- *Extending `Pre1500Prefixes` or `Pre1540Prefixes` with `1550_`*: the earlier files must stay the beta.5 and beta.6 restore points. Rejected: a beta.6.x user upgrading to beta.7 needs a restore point that is the beta.6.5 database.
- *The kind as a separate table* (`supplies (ingredient_id)`): clearer in SQL, but every filter becomes a join and the kind could not be a default. Rejected for a column.

## Consequences

- Migration **1550** (`ALTER TABLE` only): `ingredients.kind` (default `'food'`, checked), `ingredients.restock_level` (null or > 0). The rules that span columns (a Supply has no Shelf Life; only a Supply has a Restock level) are checked in Go, as 1540 does. Migrations cannot be undone, so going back means restoring `feeder-pre-1550.db`, taken before the migration runs ([b7-snap.md](../dev/design/b7-snap.md)), as [ADR 0015](0015-base-recipes.md) says for 1540.
- Every existing Ingredient becomes `food`; no data moves; an existing "Toilet paper" Ingredient stays food until a User makes it a Supply.
- The Ingredient domain gains `Kind` and `RestockLevel`; the store gains the kind-change and merge guards and `?kind=`; the API gains `kind` and `restockLevel` on every Ingredient and the error codes of decisions 2, 3, 5 and 6.
- `internal/recipe/store`, `internal/household`, `internal/recipefile` and the Recipe picker gain guards; `internal/shopping` gains a pure `Restock` rule; Scan's `Ensure` gains a kind.
- The word "Ingredient" now covers a non-food row in code. GLOSSARY keeps the user-facing words apart (Ingredient is food, Supply is not), and the `glossary` rule of `scripts/check-ui.sh` refuses the _Avoid_ words in every `strings.ts`.
- Not in this feature: price per piece, usage rates, budgets, a Today tile, notifications, a per-unit counter, Supplies in the Recipe File, new Storage Place kinds.
