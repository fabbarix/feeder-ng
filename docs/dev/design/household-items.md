# Household items: Supplies (plan)

Status: **plan, decided** (2026-11-13; the user's answers in §9: D1 to D8 all decided by the user; D4, D6 and D7 confirmed the same day). Base: 1.0.0-beta.6.5 (4f7b12bd). No code changes yet.

The user: "One small feature: allow tracking buying of products that are not ingredients but household items we want to track
prices and stock." Examples: dish soap, toilet paper, bin bags, batteries, laundry pods. They are bought at Shops, scanned by
barcode, priced, and kept in Stock as Stock Lots. They are never used by a Recipe, the planner, Exclusions, Cook Mode or Cooked.

The term is **Supply**, plural **Supplies** (§3, decision D1). "Item" is an _Avoid_ word for Ingredient, Product and Stock Lot.

## 1. Goal and scope

**In**

| Area | What a Supply gets |
|---|---|
| Catalogue | a Supply with a name, Base Unit, Unit Conversions, a Picture, its Products and barcodes (Settings > Catalogue > Supplies) |
| Scan | an unknown barcode can be saved as a Product of a new or existing Supply; Shop mode and Stock-take work as for food |
| Price | Prices per Product per Shop, as today; the Shopping List's estimated cost includes Supply Lines |
| Stock | Stock Lots in Storage Places, Move to, Edit, Set total, a "Used up" action; never Use soon or Spoiled |
| Shopping List | by hand (an Ingredient extra, which exists), and a **Restock level** that adds a Line when Stock is low (decision D2) |
| Stock-take | unchanged: +1 pack, −1 pack, Set total |
| Pantry | Supply Lots show in their Storage Place; a "Food / Supplies" filter in the Filters panel |

**Out** (food-only, unchanged and never reached by a Supply): Recipes, ingredient lines, Base recipes, Ready Meals, the planner
(Ingredient Overlap, Exclusions, Couldn't plan), Preferences, Cook Mode and the cooking timeline, Cooked deductions and Used from,
Leftovers, Shelf Life and Frozen Shelf Life, Good until, Use soon, Spoiled, Throw out / Keep, the Zero-waste streak, the "Stock about
to spoil" notification, Bought for a Planned Meal, the Recipe File, Import Review, the Agent Prompt and the Recipe Assistant.

**What "small" means here**

- **No new entity and no new table.** A Supply is a row of `ingredients` with `kind = 'supply'`. Products, barcodes, Shop
  Barcodes, Prices, purchases, Stock Lots, Storage Places, ticks, Not needed and scan events keep their `ingredient_id` and need no
  change.
- **One additive migration** (two columns), with the snapshot the release guard asks for (§5.1).
- **One new rule**, the Restock level Line in `internal/shopping`. Everything else is guards ("a Supply may not be used here") and
  hiding food-only controls.
- **Not in this feature**: price per piece or per roll, usage rates or "runs out in N days", budgets and spend reports, a Today
  tile, notifications, a "Made it" or "Used one" counter per Base Unit, Supplies in the Recipe File, changing the three Storage Place
  kinds.

## 2. Options for the model

### (a) A kind on Ingredient — **recommended**

`ingredients.kind` is `food` (default, every existing row) or `supply`. A Supply reuses Product, Stock Lot, Price, purchases, the
Shopping List, Scan and Stock-take unchanged. Food-only paths refuse or hide a Supply.

- **Pros:** additive migration, no table rebuild; every `ingredient_id` key (`products`, `stock_lots`, `shopping_extras`,
  `shopping_ticks`, `shopping_not_needed`, `scan_events`, `stock_waste`, `planned_meal_bought`, `ingredient_storage`) keeps working;
  pack suggestions, estimated cost, Tick by hand, Not needed, live updates (SSE) and offline sync need nothing new. The same move
  ADR 0015 made for Base recipes (a sub-kind of Ingredient marked in `ingredients`, reusing Stock as it is).
- **Cons:** the word "Ingredient" now covers a non-food row in code; every place a User picks an Ingredient for food must filter
  (list below). Name uniqueness (`ingredients.name_key UNIQUE`) spans both kinds: a Supply "Vinegar" blocks a food "Vinegar".
- **Size:** S–M. About 1 migration, 1 domain field, ~10 guards and filters, 1 pure rule, 3 screens touched plus 2 reused routes.
- **Code paths:** `internal/ingredient` (+store, +httpapi), `internal/recipe/store` (line and Base recipe guards),
  `internal/recipe/store` `SetIngredientExclusion` (Exclusion guard), `internal/recipefile` (Existing, review), `internal/shopping` (Restock Lines),
  `internal/scan/httpapi/wiring.go` (`ingredientsPort.Ensure` gets a kind); web `features/ingredients`, `recipes`, `stock`, `scan`,
  `shop`, `settings`, `app/breadcrumbs.ts`.

### (b) A Product with no Ingredient (`products.ingredient_id` nullable)

- **What breaks:** `products.ingredient_id NOT NULL` and `stock_lots.ingredient_id NOT NULL` need a table rebuild (as
  `1100_autoincrement.sql` did) with foreign keys off. Stock is keyed by Ingredient: `GET /api/stock` totals, `PUT
  /api/stock/ingredients/{id}/total` (Set total and Stock-take), By Ingredient, `ingredient_storage` (the remembered Storage Place)
  and Deduction order all group by `ingredient_id`. The Shopping List is written in Ingredients: `shopping.Line`, `shopping_ticks`
  (PK `range_to, ingredient_id`), `shopping_not_needed`, Ingredient extras, and the scan service's "match the list line by
  Ingredient". The pack size is "in the Ingredient's Base Unit", so a Product would need its own Base Unit. Two brands of toilet
  paper would be two unrelated Stocks with no shared total and no shared Line.
- **Pros:** no Ingredient-language stretch.
- **Cons:** touches Stock, shopping, scan, product and the offline catalogue in every function that reads `ingredient_id`; the
  rebuild is the riskiest kind of migration; loses the "one Line, many brands" behaviour that makes food work.
- **Size:** L. Rejected.

### (c) A separate Household Item entity with its own Stock

- New tables for the entity, its Lots, its ticks and extras; barcode resolution (`/api/resolve`, `/api/catalog`, `GET
  /api/scan/offline`) resolves to one of two targets; `scan_events` and Undo carry a second id; Pantry, Shop and Scan render two
  row types; Prices and purchases either duplicate or become polymorphic.
- **Pros:** clean separation; no filters on food paths.
- **Cons:** duplicates Stock, Scan, Price and Shopping List logic that took beta.2 to beta.6 to settle; two sets of offline
  code; doubles the tests. **Size:** XL. Rejected.

### Every place that assumes "Ingredient = food" (option a)

| # | Place | Code | Change |
|---|---|---|---|
| 1 | Recipe ingredient line picker and quick-create | `web/src/features/recipes/api.ts` (`ingredients`), `hooks/useQuickCreateIngredient.ts`, IngredientSelect | food only; quick-create makes food |
| 2 | Saving a Recipe line or a Step use | `internal/recipe/store/store.go` (`refuseSupplyLines`, before the write and again inside its transaction in `CreateTx`/`ReplaceTx`) | `422 ingredient_is_supply` on `lines[i].ingredientId` or `steps[i].uses[j].ingredientId` (a use may name an Ingredient on no line); only lines and uses the save adds, so a stored one never blocks an unrelated save |
| 3 | Ready Meal's Ingredient by name | `internal/recipe/readymeal.go` `ChooseReadyMealIngredient`, `internal/recipe/store` | a Supply of that name is refused (`422 supply_name_taken`) |
| 4 | Base recipe take-over by name | `internal/recipe/store/base.go` (name_key lookups ~l.380, l.430) | never offer a Supply; refuse `supply_name_taken` |
| 5 | Base recipe line linking | `web/src/lib/baseRecipes/useLineLink.ts`, `recipe/store/base.go` | food only |
| 6 | Exclusions | `PUT /api/ingredient-exclusions/{ingredientId}` (`internal/recipe/httpapi`) → `recipe/store.SetIngredientExclusion`, `member_ingredient_exclusions`, `features/recipes/components/IngredientExclusionList.tsx` | refuse a Supply; no Excluded by Tile on a Supply |
| 7 | Import Review matching (Recipe File, Recipe Assistant) | `internal/recipefile/store/store.go` `Existing` (`s.ingredients.List`), `recipefile/review.go` | match food only; a name a Supply holds is a row error "Vinegar is one of your Supplies" with pick or rename |
| 8 | Fuzzy search | `GET /api/ingredients/search` (`ingredient/search.go`) | `?kind=food` for Import Review and the recipe editor; New Ingredient's "Did you mean" searches both |
| 9 | Merge | `internal/ingredient/merge.go`, `GET /api/ingredients/{id}/merge-preview` | across kinds is `blocked: "kind_differs"` |
| 10 | Shelf Life, Frozen Shelf Life | `ingredient.Input.Validate` | a Supply has neither (`422`) |
| 11 | Ingredients screen | `features/ingredients/screens/IngredientsScreen.tsx` | food only; Supplies get their own list (§6) |
| 12 | Ingredient page tiles | `features/ingredients/screens/IngredientScreen.tsx` | a Supply hides Shelf Life, Frozen Shelf Life, Excluded by |
| 13 | Planner | `internal/planner/stock.go`, `reserve.go` | **no change**: it reads Stock only for Ingredients of Recipe lines, which a Supply never has (guard 2). A regression test only |
| 14 | Cooked, Used from, Cook Mode | `internal/plan/runner` (`DeductCookedTx` via `stockport.go`), `internal/cook` | **no change**, same reason. Regression test only |
| 15 | Use soon, Spoiled, streak, "about to spoil" | `internal/stock`, `internal/notify`, Today tiles | **no change**: they read `goes_off`, which a Supply's Lot never has (guard 10) |
| 16 | Recipe File export | `internal/recipefile/export.go` | **no change**: it writes the Ingredients of exported Recipes, never a Supply (guard 2). Test only |

Places that **keep both kinds**: Add to Stock (`features/stock/hooks/useIngredientChoices.ts`), Shop extras
(`features/shop/lib/ingredientOptions.tsx`), the unknown-barcode form (`features/scan/lib/unknownForm.ts`), Products, Prices,
Stock-take, the Pantry.

## 3. Domain language

### Proposed GLOSSARY entries (under "Food and shopping")

**Supply**:
A generic non-food thing the Household buys and keeps in Stock (dish soap, toilet paper, batteries), with Products, Prices and
Stock Lots like an Ingredient. A Recipe never calls for it, and nothing about it goes off.
_Avoid_: Item, household item, household good, non-food, consumable, sundry, essential
_Note_: in code a Supply is an `ingredients` row with `kind = 'supply'` ([ADR 0017](docs/adr/0017-supplies-are-ingredients-of-kind-supply.md)). "Household" stays the family.

**Restock level**:
The Stock of a Supply below which the Shopping List asks for it; the Line is the Restock level less Stock, as packs of the Product
last bought.
_Avoid_: Reorder point, par level, minimum stock, low-stock threshold, alert level

**Used up** (a Supply's Stock Lot action):
Taking some or all of a Supply's Stock Lot out of Stock because the Household used it. It is not waste and not a mistake.
_Avoid_: Consumed, finished, emptied
_Note_: a food Lot leaves Stock through Cooked, Set total or Throw out; **Delete** stays "for a mistake" for both.

**Changed entries**

| Term | Change |
|---|---|
| Ingredient | "A generic food item …" stays; add _Note_: "a non-food thing is a **Supply**, which shares its Stock, Products and Prices". |
| Product | "supplies exactly one Ingredient" → "a specific purchasable pack of exactly one Ingredient or Supply". (The verb "supplies" would read badly beside the noun.) |
| Stock, Stock Lot | "of each Ingredient" → "of each Ingredient and Supply". |
| Shelf Life, Good until | add "A Supply has none." |
| Shopping List | "… plus any manual extras" → "… plus Supplies below their Restock level, plus any manual extras". |

The `glossary` rule of `scripts/check-ui.sh` reads the _Avoid_ lists, so "household item" and "non-food" are then refused in every
`strings.ts`.

### ADR

Yes. Making an Ingredient non-food and changing "supplies exactly one Ingredient" is the kind of decision ADR 0015 recorded for
Base recipes. Proposed: **ADR 0017 "Supplies are Ingredients of kind supply"**, decision points:

1. A Supply is an `ingredients` row with `kind = 'supply'`; Products, Stock Lots, Prices, purchases and the Shopping List are
   shared and unchanged. Options (b) and (c) of §2 are the considered options.
2. Food-only paths refuse a Supply at the store (`422 ingredient_is_supply`), not only in the UI: Recipe lines, Ready Meal and
   Base recipe Ingredients, Exclusions, Import Review matches, merge across kinds.
3. A Supply has no Shelf Life or Frozen Shelf Life, so its Lots never go off and never touch the streak.
4. Names stay unique across both kinds (`name_key`), so one name means one thing in Scan, search and import.
5. The kind can change only when nothing food-only refers to the row (§4.8).
6. A Supply's Restock level adds a Shopping List Line from today's Stock, independent of the plan and the range.

## 4. Behaviour

### 4.1 Scan

- **Unknown barcode** ("what is this?", spec §10.1): the Ingredient select lists both kinds under the subheaders "Ingredients" and
  "Supplies" (the crafted `Select` already groups options under subheaders, `SelectOption.group`). Creating new offers **"New Ingredient 'X'"** and **"New Supply
  'X'"**; the New Ingredient sheet gains a two-option `Segmented` "Ingredient · Supply" when opened from Scan, the Pantry or Shop
  extras (fixed when opened from the recipe editor or a catalogue list). A new Supply defaults to Base Unit **piece**.
- The Op's new-Ingredient part gains `kind`; `ingredientsPort.Ensure(ctx, name, baseUnit, kind)` finds by name first (an existing
  row keeps its own kind; offline sync never converts) or creates with the kind.
- Shop mode and Stock-take: unchanged. A Supply on the list is ticked by its Scan; off the list it says "not on the list".

### 4.2 Stock, Lots and Storage Places

- Added by Scan, Stock-take, Tick by hand or Add to Stock, as today. `goes_off` is always null.
- Storage Places: unchanged (a "Utility cupboard" of kind pantry). The remembered place per Ingredient works for Supplies.
- **Good until and Shelf Life do not apply.** The Lot rows, Add to Stock and Lot Edit hide Good until for a Supply (not "No go-off
  date"); Use soon, Spoiled, Throw out / Keep never show for it; a Freezer move changes nothing.
- **Used up**: the Lot sheet of a Supply offers **Used up** with a quantity (the whole Lot by default). Whole: `DELETE
  /api/stock/lots/{id}`; part: `PATCH /api/stock/lots/{id}` with the new quantity. No API change: neither touches purchases or
  Prices, and a Supply Lot has no go-off or Bought rows. Delete stays, "for a mistake".
- Set total and By Ingredient: unchanged.

### 4.3 Price history per Shop

Unchanged: Prices per Product per Shop (`PUT /api/products/{id}/prices`, the scan toast's ✎), the Product page's Price list, the
Shopping List estimate. No price per piece in this feature.

### 4.4 Shopping List

- **By hand**: an Ingredient extra of a Supply ("Toilet paper, 9"), already supported by `shopping_extras`. A free-text extra
  ("toilet paper") stays free text; nothing converts it.
- **Restock level** (decision D2, in scope): a Supply with a Restock level L and Stock S today (sum of its Lots) has a
  Line of L − S when S < L. It ignores the range (a Supply's Stock does not move with the plan), uses the pack suggestion, the
  estimate, Tick, Not needed, and Scan as every Line does (all keyed by Ingredient). A Supply both restocked and added by hand shows
  both, as a food Line and its extra do today.
- **Where**: open Supply Lines and Supply extras sit after the food Lines under a **"Supplies"** subheader; Ticked and Not needed
  keep their groups. The Line row says why: "Below 6 · 2 in Stock".
- Restock levels are for Supplies only, never for food (decision D3).

### 4.5 Stock-take

Unchanged (spec §10.2): scan, then +1 pack, −1 pack, Set total.

### 4.6 Pantry filters

Supply Lots show in their Storage Place groups and in By Ingredient. The Filters panel gains a section **"Food or Supplies"** with
two toggle chips, **Food** and **Supplies**, one choice like Use soon / Spoiled (none = both). URL `?stock=food|supplies`, applied in
both lists, a removable chip in row 3. It is not in the existing **Kind** section: that is the Storage Place kind (pantry, fridge,
freezer, pantry-filter.md §2.2). The section shows only while the Household has a Supply.

### 4.7 Units

A Supply is counted in its Base Unit: **piece** for rolls, pods, batteries and bags; **ml** or **g** for liquids and powders. "Packs
of N" is the Product's pack size (Lotus 9 rolls = 9 pieces), so Scan adds 9 and the pack suggestion rounds up to whole packs. Unit
Conversions work as for food. Rows say "9 pieces"; a per-Supply count noun ("rolls") is not in this feature.

### 4.8 Changing the kind

The Supply or Ingredient page has a Tile **"This is food" / "This is not food"**. To a Supply: refused while the Ingredient is on a
Recipe line, has an Exclusion, is a Base recipe's or a Ready Meal's (`409 kind_in_use` with the reasons, shown in a crafted dialog);
otherwise a confirm says its Shelf Life and the Good until of its N Lots are cleared. To food: always allowed; the Restock level is
cleared. Recorded go-offs (`stock_go_offs`) and waste stay history.

### 4.9 Import and export

A Recipe File never holds a Supply: Recipes cannot have Supply lines (guard 2), so export writes none; Import Review matches food only
and treats a name a Supply holds as a conflict to resolve. The Agent Prompt and the Recipe Assistant's output schema do not change.

### 4.10 Today, the board, notifications

No change: a Supply never goes off, so it is never in Use soon or Spoiled; there is no low-stock tile or notification (decision
D4, confirmed by the user).

### 4.11 Quick Use from the Supplies list

WP H9. The user asked: "In the supply list page show the level of the stock and add a Use icon/button to deduct units from the stock
quickly". It builds on Used up (§4.2): a Supply's Stock goes down because it was used, not wasted.

**Stock level on each row of `/supplies`**

- The row's meta line shows the total Stock and the Restock level: **"9 pieces · restocks below 6"**. A g or ml level carries its unit
  ("800 ml · restocks below 500 ml"); a piece level is the bare number. A Supply with no Restock level shows only the Stock ("9 pieces").
- Below the level (Stock under it; equal is not below) the meta takes the **info tone** and says **"4 pieces · below Restock level 6"**,
  the words the Lot sheet's Used up (H6) pins. The tone is never the only signal: the words say it.
- No Stock reads **"None in Stock"** (info tone only when a Restock level is set, since 0 is under any level).
- **Data: join `GET /api/stock` in a hook, no new field.** `GET /api/stock` already answers one total per Ingredient with `kind`
  (H4) and refreshes on the `stock` event (`useStockTotals`); the Supplies list (`GET /api/ingredients?kind=supply`) already has
  `restockLevel`. A new `useSupplyStock` hook maps each `kind: "supply"` total to its Ingredient id and a Supply missing from the
  answer has 0. Why not an additive field on the Ingredient list: it would make the catalogue endpoint depend on Stock, would not
  refresh with the `stock` event (the Ingredient query is not invalidated by it), and costs a server change for a join the web does
  in one `Map`. The extra request is one cheap query already cached by the Pantry. Until Stock has loaded, or if it fails, the rows
  keep their old meta ("piece · restocks below 6 pieces") and every Use button is disabled.

**The Use button**

- A shared `IconButton` in the row's trailing slot, beside the chevron: the Phosphor **`MinusCircle`**, registered as the icon `use`
  in `ui/icons.ts` (the one additive shared change). Why: it reads as "take one out" in one glance and keeps the circle target of
  the other row actions; `HandGrabbing` says "pick up" (it would read as Add to Stock or "take it with me"), and the bare `minus` is
  the Stepper's. Accessible name: **"Use one Toilet paper"** for a piece Supply, **"Use some Dish soap"** for g and ml. It never
  opens the row.
- **Pieces: one tap uses 1.** **g and ml: a tap opens a small sheet** ("Use Dish soap", a `NumberField` "How much" in the Base Unit,
  buttons **Use** and **Use all**). The field starts at the **pack size of the Product last bought** (`GET /api/products/last-bought`,
  already used by the Restock Lines), never above Stock; empty when none is known. More than Stock or 0 is refused in the sheet
  ("Only 800 ml in Stock", "Use more than 0").
- **Used up, not waste**: no waste record, no go-off record, no Throw out, and the zero-waste streak does not move. It is not a
  Cook either: no Purchase, Price or Recipe is touched.
- **Toast with Undo**: "Used 1 Toilet paper · Undo", "Used 250 ml of Dish soap · Undo". Undo puts back exactly what was taken
  (below) and toasts "Put back 1 Toilet paper".
- **Disabled** (native `disabled`) when the Supply has no Stock, while its own request is in flight, and until Stock has loaded.
- **Offline: it needs a connection.** The stock module does not queue offline (no Stock op in the sync queue; `useStock` only shows
  "Stock is not saved on this device yet"), so a tap offline sends nothing and toasts the error "Using a Supply needs a connection".
  Queuing a Use would need an offline Op with its own conflict rules (what if the Lot was edited elsewhere): not in this feature.

**API**

| Endpoint | Behaviour |
|---|---|
| `POST /api/stock/ingredients/{id}/use` `{"quantity": 1}` | Takes `quantity` (Base Units) from the Supply's Lots, **oldest purchased first** (`stock.Use`, which follows `stock.Deduct`'s order: a Supply's Lots have no go-off date, so it is oldest purchase, then lowest id). Emptied Lots are deleted (a correction, never a go-off or waste). Answers `200 {ingredientId, name, baseUnit, quantity, total, taken: [{lotId, quantity, purchased, storagePlaceId, productId, shopId}]}`: `total` is the Stock left, `taken` is in the order taken and carries what a Lot needs to be rebuilt. Publishes one `stock` event `{changed: "lots", ingredientIds: [id]}` after the commit |
| `POST /api/stock/ingredients/{id}/use/undo` `{"taken": [...]}` | Puts each entry back: a Lot that still exists gets the quantity added; an emptied Lot is **recreated** with its `purchased`, Storage Place, Product and Shop (a new id, no go-off date). Answers like Use (`quantity` = what came back, `total` = Stock now). Same event |

- Refusals, all `422` with `error.code`: **`ingredient_not_supply`** (food: Use is for Supplies only), **`use_quantity_invalid`**
  (quantity 0, below 0 or absent; for Undo an empty or missing list, a quantity of 0 or less or a missing `purchased`),
  **`use_exceeds_stock`** (more than is in Stock, or none at all; nothing is taken). An unknown Ingredient is `404 not_found`.
  Nothing changes and nothing is published on a refusal.
- **Why Undo takes the Lots back instead of a server-side token**: no new table, no expiry to design, and Undo keeps working after
  a reload of the toast's closure; the cost is that Undo trusts the client's Lots, which is fine: every User of the Household may
  already edit any Lot (`PATCH /api/stock/lots/{id}`). Undo is not idempotent (pressing it twice puts it back twice), so the web
  disables the toast action after one press.
- Code: `stock.Use` (pure, `internal/stock/use.go`), `Service.UseSupply` and `Service.UndoSupplyUse` (`internal/stock/service/use.go`,
  one transaction, publish after commit), thin handlers in `internal/stock/httpapi`. Errors: `stock.ErrUseNotPositive`,
  `stock.ErrUseExceedsStock`; `service.ErrNotSupply`, `service.ErrUseInvalid`, `service.ErrUseExceedsStock` (each also an
  `ErrInvalid`).

**Web**: `lib/supplyUse.ts` (pure: level text, amounts, labels), `supplyUseApi.ts`, hooks `useSupplyStock` and `useSupplyUse`
(the flow, toasts, busy, offline), components `SupplyList` (rows) and `UseSupplySheet`; `SuppliesScreen` composes them. All in
`features/ingredients`; `features/stock` is only read (`useStockTotals`), never edited.

## 5. Data and API changes

### 5.1 Migration and snapshot

`internal/db/migrations/1550_supplies.sql`, additive only (no rebuild, no foreign-key pragma):

```sql
ALTER TABLE ingredients ADD COLUMN kind TEXT NOT NULL DEFAULT 'food' CHECK (kind IN ('food', 'supply'));
ALTER TABLE ingredients ADD COLUMN restock_level REAL CHECK (restock_level IS NULL OR restock_level > 0); -- Base Units, Supply only
```

The rules that span columns (a Supply has no Shelf Life; only a Supply has a Restock level) are checked in Go, as 1540 does.

**Snapshot:** `scripts/test/b5-snap_test.sh` fails any `15NN` file outside `1500_`–`1540_` ("extend Pre1500Prefixes or name the next
snapshot"). Following [b6-snap.md](b6-snap.md), the decision is to **name the next snapshot**, `feeder-pre-1550.db`: the pre-1540 file
must stay the beta.6 restore point, and a beta.6.x user upgrading to **1.0.0-beta.7** (decision D8) needs a restore point that is
the beta.6.5 database.

| Package | Name |
|---|---|
| `backup` | `const PreSnapshot1550File = "feeder-pre-1550.db"` |
| `db` | `var Pre1550Prefixes = []string{"1550_"}`, `NeedsPre1550Snapshot(ctx, d)` |
| `cmd/feeder` | `preSnapshots` row four, after 1540 |
| tests | `internal/db/pending1550_test.go`, `internal/backup/snapshot_named_1550_test.go`, `cmd/feeder/startup_pre1550_test.go`, `scripts/test/b7-snap_test.sh` (order 1400, 1500, 1540, 1550), `b5-snap_test.sh` accepts `1550_` only if `Pre1550Prefixes` lists it |
| docs | `docs/dev/design/b7-snap.md`, functional-spec decision entry, `docs/dev/deploy.md`, CHANGELOG |

(Numbering it 1600 would dodge the guard without a decision; not recommended.)

### 5.2 Backwards compatibility

Every existing Ingredient becomes `food`; no data moves; every existing endpoint answers as before plus two fields. A pre-upgrade
"Toilet paper" Ingredient stays food until a User makes it a Supply (§4.8). Free-text extras stay. Older cached PWAs ignore `kind`.

### 5.3 Endpoints

| Endpoint | Change |
|---|---|
| `GET /api/ingredients`, `GET /api/ingredients/{id}` | each Ingredient gains `kind: "food" \| "supply"` and `restockLevel: number \| null`; optional `?kind=food\|supply` (absent = both) |
| `POST /api/ingredients`, `PATCH /api/ingredients/{id}` | accept `kind` and `restockLevel`; `422` for a Supply with a Shelf Life, a food with a Restock level; `409 kind_in_use {reasons}` on a refused kind change |
| `GET /api/ingredients/search` | optional `?kind=` |
| `GET /api/ingredients/{id}/merge-preview` | `blocked: "kind_differs"` |
| Recipe save, Ready Meal save, Base recipe save and link | `422 ingredient_is_supply` / `supply_name_taken` |
| Import Review (Recipe File, Recipe Assistant) | Ingredient row `status: "supply"` with Problem `supply_name_taken` ("X is one of your Supplies"), also for a Base recipe named like a Supply; Apply answers stale if an Ingredient became a Supply since the review |
| `PUT /api/ingredient-exclusions/{ingredientId}` | `422 ingredient_is_supply` (field `ingredientId`) for `excluded: true` on a Supply; `excluded: false` stays allowed |
| `GET /api/shopping/list` | a Line gains `kind` and `restock: {level, stock} \| null`; extras gain `kind` |
| `GET /api/stock`, `GET /api/stock/lots` | each row gains `kind` |
| `GET /api/scan/offline`, `POST /api/scan`, `POST /api/scan/sync` | Ingredients carry `kind`; the unknown-barcode Op's new Ingredient carries an optional `kind` (default `food`) |

## 6. UI changes per screen

| Screen | Change | Primitives |
|---|---|---|
| Settings > Catalogue | new row **Supplies** (`settingsSections.ts`), between Ingredients and Products | existing section list |
| `/supplies`, `/supplies/:id` (new routes) | the Ingredients list and page with `kind="supply"`: the page shows Base Unit, Picture, Unit Conversions, **Restock level** (new Tile, a `NumberField` in Base Units), Products, kind Tile, Merge, Delete; no Shelf Life, Frozen Shelf Life, Excluded by. Breadcrumbs Settings › Supplies › Dish soap (`app/breadcrumbs.ts`, `pageWidths.ts`) | `BentoGrid`, `Tile`, `ListRow`, `Thumb` |
| `/ingredients`, `/ingredients/:id` | food only; the kind Tile "This is not food" | `Tile`, `ConfirmDialog` |
| New Ingredient sheet | `Segmented` "Ingredient · Supply" where both are allowed; Supply hides Shelf Life, defaults to piece | `BottomSheet`, `Segmented` |
| Recipe editor, Exclusion lists | pickers pass `kind=food` | `Select` |
| Scan: "what is this?" | Ingredient select with "Ingredients" / "Supplies" subheaders and both create options | `Select` (subheaders), `BottomSheet` |
| Pantry | "Food or Supplies" section in the Filters panel, its chip in row 3; Supply rows without Good until; Lot sheet **Used up** with a `StepperField`; Add to Stock hides Good until for a Supply | `FiltersPanel`, `FilterChipGroup`, `ActiveFilterChips`, `ListRow` |
| Shop | "Supplies" subheader group after the food Lines; Restock copy on the row; extras select with subheaders | `ListRow`, `Select` |
| Icon | one Phosphor icon for Supply (e.g. `SprayBottle`) added to `ui/icons.ts` | shared `Icon` |

No native control, no `alert`/`confirm`; every new string in a feature `strings.ts`, checked by the glossary guard.

## 7. Work packages

Team format: **test author** (Sonnet) writes unit tests and Gherkin first → **developer** (Haiku) → **reviewer** (Opus) approves or
sends back. Sizes: S ≈ half a day of team time, M ≈ one day.

| WP | Scope | Files owned | Depends on | Size |
|---|---|---|---|---|
| **H0 Language** | GLOSSARY entries, ADR 0017, functional-spec decision 49 and §5, §6, §9, §10, §13 text | `GLOSSARY.md`, `docs/adr/0017-supplies-are-ingredients-of-kind-supply.md`, `docs/spec/functional-spec.md` | D1–D3, D5 (decided) | S |
| **H1 Schema + snapshot** | migration 1550, pre-1550 snapshot | `internal/db/migrations/1550_supplies.sql`, `internal/db/db.go`, `internal/db/pending1550_test.go`, `internal/backup/backup.go` (+test), `cmd/feeder/startup.go` (+test), `scripts/test/b5-snap_test.sh`, `scripts/test/b7-snap_test.sh`, `docs/dev/design/b7-snap.md` | H0 | S |
| **H2 Supply domain + Ingredient API** | `Kind`, `RestockLevel`, validation, kind change guard, merge guard, `?kind=` | `internal/ingredient/**` | H1 | M |
| **H3 Food-only guards** | guards 2–7 of §2 | `internal/recipe/readymeal.go`, `internal/recipe/store/**` (Exclusions: `SetIngredientExclusion`), `internal/recipefile/**` | H2 | M |
| **H4 Restock Lines + kind in lists** | pure `shopping.Restock`, Line `kind`/`restock`, service and handler; `kind` on Stock and offline rows; `Ensure` with kind | `internal/shopping/**`, `internal/stock/httpapi/**`, `internal/scan/**` | H2 | M |
| **H5 Web catalogue** | Supplies routes, list and page, Restock Tile, kind Tile, New Ingredient `Segmented`, food-only pickers | `web/src/features/ingredients/**`, `web/src/features/products/**` (Products Tile only if needed), `web/src/features/settings/lib/settingsSections.ts`, `web/src/app/breadcrumbs.ts`, `web/src/app/pageWidths.ts`, `web/src/features/recipes/api.ts`, `recipes/hooks/useQuickCreateIngredient.ts`, `recipes/components/IngredientExclusionList.tsx`, `web/src/lib/baseRecipes/**`, `web/src/ui/icons.ts` | H2 (contract) | M |
| **H6 Web Pantry** | filter section, Supply rows, Lot sheet Used up, Add to Stock | `web/src/features/stock/**` | H4 (contract) | M |
| **H7 Web Scan + Shop** | unknown form kind and subheaders, offline kind, Supplies group, Restock copy | `web/src/features/scan/**`, `web/src/features/shop/**` | H4 (contract), H5 (New Ingredient sheet) | M |
| **H8 Guards + release** | page-layout routes and scenarios, BDD wiring, the 1.0.0-beta.7 CHANGELOG entry, the deploy.md "Upgrading to 1.0.0-beta.7" section | `scripts/check-page-layout.modes`, `scripts/check-page-layout.mjs` scenarios, `bdd/steps_supplies_test.go`, `bdd/features/supplies/**`, `CHANGELOG.md`, `docs/dev/deploy.md` | all | S |

**Order and parallelism**

```
H0 ─► H1 ─► H2 ─┬─► H3 ───────────────┐
                ├─► H4 ─┬─► H6        ├─► H8
                └─► H5 ─┴─► H7 ───────┘
```

- After H2: **H3, H4 and H5 run in parallel** (disjoint files). Web test authors may start as soon as §5.3 is frozen, with fixtures.
- **H6 and H7 run in parallel** after H4; H7 waits for H5's New Ingredient sheet. No two WPs own the same file.
- Total: about 3 S + 6 M, roughly 7–8 team-days, 3 days of wall time with three teams.

## 8. Tests

**Unit (Go)**

- `internal/ingredient`: `Validate` for kind (unknown kind, Supply with Shelf Life, food with Restock level, Restock level ≤ 0);
  `PlanMerge` blocked across kinds; kind change rules.
- `internal/ingredient/store`: column round-trip, `?kind=`, `kind_in_use` reasons (line, Exclusion, Base recipe, Ready Meal), clearing
  Shelf Life and Lot `goes_off` on the change.
- `internal/shopping`: `Restock` (below, at, above the level; no Stock; pack rounding; ticked; Not needed; with an extra; range
  ignored; a food Ingredient with a stray level is ignored).
- `internal/recipe/store`, `recipefile`: each guard refuses a Supply; Import Review conflict on a Supply's name;
  export of a Household with Supplies writes none.
- Regression: planner (`internal/planner`) and Cooked (`internal/plan/runner`) unchanged with Supply Stock present; streak and
  notify ignore Supply Lots.
- Snapshot: the H1 tests of §5.1.

**Unit (web, Vitest)**

- `features/stock/lib/pantryFilters.ts`: `?stock=` parse, chips, applies in both lists, hidden without Supplies.
- `features/shop/lib/lines.ts`/`rows.ts`: Supplies group order, Restock copy.
- `features/scan/lib/unknownForm.ts`: the Op carries `kind`; default Base Unit piece for a new Supply.
- `features/ingredients/lib`: food-only pickers; kind Tile states.
- Component tests: Supply page hides food Tiles; Lot sheet Used up (whole and part); New Ingredient `Segmented`.

**BDD (Gherkin)**, new `bdd/features/supplies/`:

- `supplies.feature`: create a Supply; it is not offered in the recipe editor; a Recipe line with it is refused; an Exclusion of it is
  refused; merge with food is blocked; kind change refused while on a Recipe line, allowed otherwise and clears Good until.
- `supplies_scan.feature`: an unknown barcode saved as a new Supply adds a Lot without Good until and records the Price; offline
  sync creates it; Stock-take −1 pack.
- `restock.feature`: below the level a Line appears with packs and cost; a Scan ticks it; at the level nothing; Not needed for the
  range.
- `supplies_food_only.feature`: Import Review never matches a Supply; the planner and Cooked ignore Supply Stock; the streak is
  unchanged by Supply Lots.

**Page layout** (`scripts/check-page-layout.sh`): `/supplies` and `/supplies/:id` added to `fail_routes`; scenarios at 360, 390, 834,
1440: the Pantry Filters panel with the new section in the 358 px sheet (one line per row), the "Supplies" chip in row 3, the Shop list
with a Supplies group, the "what is this?" sheet with subheaders, the Supply page grid.

## 9. Decisions

The user answered on 2026-11-13. D4, D6 and D7 kept the recommendation and were then **confirmed by the user**; the plan builds
them as written.

| # | Question | Decision | Status |
|---|---|---|---|
| D1 | The term for a household thing that is not food | **Supply**, plural **Supplies**; "item", "household item" and "non-food" go on its _Avoid_ list (§3) | decided by the user |
| D2 | Restock levels in scope? | **Yes.** A Supply below its Restock level gets a Shopping List Line by itself (§4.4, WP H4) | decided by the user |
| D3 | Restock levels for food too? | **No, Supplies only.** `restock_level` on a food Ingredient is refused (`422`); a food level would have to combine with the plan's need and is a separate decision | decided by the user |
| D4 | Today and notifications for a Supply below its Restock level | **No**: it shows on the Shopping List only; no Today tile, no board change, no notification (§4.10) | decided by the user (confirmed) |
| D5 | Where Supplies live in the catalogue | **Their own list and pages**: Settings > Catalogue > Supplies, `/supplies` and `/supplies/:id`; the Ingredients list and page are food only (§6, WP H5) | decided by the user |
| D6 | Pantry default | **Supplies show beside food by default**, with the "Food or Supplies" filter to narrow it (§4.6) | decided by the user (confirmed) |
| D7 | Used up | **In**: a Supply's Lot sheet has Used up, whole or part of a Lot; no per-piece counter (§4.2, WP H6) | decided by the user (confirmed) |
| D8 | Release | **1.0.0-beta.7**, with migration 1550 and the `feeder-pre-1550.db` snapshot (§5.1, WP H1, H8) | decided by the user |

ADR 0017 records D1 to D8 as decided by the user.
