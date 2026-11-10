# T13 shopping and scan: design

Scope: functional-spec §9 (Shopping List), §10.1-10.4 (Shop mode, Stock-take, offline and sync, camera), §14 (Bento), §15 items 3, 7, 8, 9. GLOSSARY words: Shopping List, Scan, Stock-take, Stock Lot, Product, Shop, Shop Barcode, Weight Barcode Rule, Price, Batch, Leftover. Builds on [t5](t5-barcode.md) (mirrored Go/TS resolver), [t9](t9-products-shops.md) (Catalog, purchases, LastBought, Prices), [t10](t10-stock.md) (Stock Lots, `client_uuid`), [t3](t3-planner-core.md) (pack remainders) and [t11](t11-planning.md) (Planned Meals; on `team/t11-planning`, synced into this branch after it lands). Tests first (red); the Developer implements until `scripts/check.sh` passes.

## Decisions taken
- **Layers.** `internal/shopping` (pure: `Derive`, range and pack maths), `internal/shopping/store` (extras, ticks), `internal/shopping/service` (builds a `shopping.Input` from ports, ticks, extras, events), `internal/shopping/httpapi` (module `shopping`). `internal/scan` (pure: `Op`, validation, result types), `internal/scan/store` (ledger `scan_events`), `internal/scan/service` (apply, sync, undo, offline), `internal/scan/httpapi` (module `scan`). Services talk to Stock, Products, Planning and Ingredients through **small ports** (interfaces in each service package), so unit tests use fakes; the Developer writes the real adapters in the `httpapi` packages (`wiring.go`) over `stock/service`, `product/store`, `ingredient/store`, `household/store` and the Planning store. Handlers are thin. Scan depends on Shopping only through the port `ListPort`; Shopping reads the ledger through `Ledger`: no import cycle.
- **Range.** `from` = now, `to` = a household date. `LastPlannedDate(today, horizonDays) = today + horizonDays - 1` (the Planning Horizon includes today, as `plan.HorizonDates`). `DefaultTo = min(today+7, LastPlannedDate)`; `ClampTo` caps a chosen date at `LastPlannedDate` and raises one before today to today; an empty or invalid date means `DefaultTo`.
- **"From now"**: a Planned Meal counts when its slot instant (`At`) is not before `Now`. A meal whose slot has passed and is waiting in "To confirm" is the cook's business, not shopping's.
- **Meals counted**: Planned Meals with state `planned` (uncooked, not skipped), fresh (not served from a Leftover), `Date` in `[today, to]` and `At >= Now`. The adapter returns them with each Recipe's Needs **per Batch in Base Units** (`planner.Need`-shaped, `Optional` lines flagged); `Derive` multiplies by `Batches`, drops Optional lines and ignores a meal flagged `Leftover`.
- **Available is simulated, not a single subtraction.** Meals are processed in date order (slot time breaks ties); each draws from the projected lots usable on its date (`GoesOff` none or `>= meal date`), soonest go-off first, then oldest, then lot id (the Stock consumption order); the Ingredient's **Line quantity is the total shortfall**. So a 500 g lot that goes off Tuesday covers Monday's 300 g but not Wednesday's 300 g (Line = 300 g, Available = 200 g wasted).
  `Need` = sum of Batches x quantity, `Available` = need minus shortfall, `Quantity` = shortfall, a Line exists only when `Quantity > 0` (or the Ingredient is ticked).
- **Pack suggestion**: `Pack` = the Product last bought for the Ingredient (at the selected Shop if one was bought there, else anywhere: `LastBought`). `Count = ceil(Quantity / Size)` (1e-9 tolerance), `Remainder = Count x Size - Quantity`. No Product bought: no `Pack`, exact quantity, no remainder.
- **Estimated cost**: `Line.EstimatedCostCents = Count x pack price`, where the pack price is the latest Price at the selected Shop, else the latest at any Shop (`PackPrices`, resolved by the adapter from `priceCents`; a Price with only a price per kg gives no pack price). A Line with no Pack or no price has `EstimatedCostCents = nil` ("—" in the UI) and adds to `UnpricedLines`. `EstimatedCostCents` sums the priced, **unticked** Lines. Currency is the household currency.
- **Ticks** are stored per `(range_to, ingredient)`: ticked state is kept for the current list range, and ranges are independent. A ticked Ingredient stays in the list even when its derived Line is gone (a scan covered it): it shows `Quantity = 0`, `Need` = the quantity it needed when ticked (`shopping_ticks.needed`), and slides into the "Ticked" group. A tick stays until unticked (`DELETE`) or the range's `to` is past (the store purges ticks with `range_to < today` on every write). A ticked Line is excluded from cost and `UnpricedLines`, has no `Pack`.
- **Progress** = `Ticked / Total` over Ingredient Lines (derived plus tick-only) plus Extras. `Complete = Total > 0 && Ticked == Total` (the **Shopping list complete** celebration). **Summary** for the celebration: `Lines` = Total, `SpentCents` = sum of `price_cents` of the range's applied, not undone Shop-mode scan events, `LotsAdded` = their lots plus lots added by ticks by hand.
- **Tick by hand** (`POST /api/shopping/ticks`) takes `quantity >= 0` ("how much?", prefilled with the Line quantity by the SPA). `> 0` adds a Stock Lot (source `manual`, `clientUuid` forwarded for idempotency); `0` only ticks. It does not record a purchase or Price (no Product).
- **Manual extras**: `{text}` or `{ingredientId, quantity}`; never merged into plan Lines. An Ingredient extra tracks `got` (Scanned or ticked so far): remaining = `quantity - got`, ticked at remaining <= 0. A scan matches the plan Line first; with no plan Line it matches an open Ingredient extra. Ticking an extra by hand sets it ticked (an Ingredient extra asks "how much?" and adds a Stock Lot like any Ingredient Line). A ticked extra is listed as ticked for the rest of that household day, then dropped.
- **Scan ops** (one flat `Op`, `kind`): `shop_scan` (the phone resolved the barcode: `productId`, `quantity` = pack size or decoded weight in Base Units, optional `priceCents`, `pricePerKgCents`), `shop_unknown` (unknown-barcode form: creates the Product, then proceeds as `shop_scan`), `stock_take` (`plus_pack | minus_pack | set_total`). Every op carries `clientUuid` (idempotency key) and `scannedAt`. The server does not re-resolve a barcode: the phone already did with the cached Catalog; online the SPA uses the same ops.
- **Apply `shop_scan`** (service, one logical unit, compensating on failure): (1) Stock Lot via the Stock port with `productId`, `shopId`, `clientUuid` (source `scan`); (2) `SetSoldAt`, remembering whether it was newly added; `RecordPurchase(product, shop, today)`; (3) price: `priceCents` as given, else the **latest Price at this Shop** (prefill); recorded as today's Price when a price is known (same-day Price is replaced, the replaced one is kept in `prev_price_json`); (4) `ListPort.AfterLot(ingredient, rangeTo, shop, quantity)`: reduces the matching Line (or open extra), ticks it at remaining <= 0 (`Ticked`), or reports `OnList=false` ("not on the list"); (5) ledger row; publish `shopping` `{"changed":"scan"}`. A repeated `clientUuid` returns the stored result with status `duplicate` and changes nothing (no second lot, purchase or event).
- **Undo** (`POST /api/scan/{clientUuid}/undo`) reverses steps (1)-(4) of that event: removes the Lot (the Stock port needs `RemoveLot`, a small addition to T10's service/store, see Shared files), deletes the purchase, un-sells the Product only if this event added the link, deletes the Price it wrote or restores `prev_price_json`, unticks only if this event ticked the Line, subtracts the extra's `got`. Idempotent: a second Undo answers 200 `alreadyUndone: true`. An Undo of an unknown uuid is 404; of a `stock_take` op is 409 `not_undoable`.
- **Price edit** (`PATCH /api/scan/{clientUuid}` `{priceCents}`): updates the Price row the event wrote (or records it) and the event's `price_cents` (so "total spent" follows). "Leaving it as is confirms it" needs no call.
- **Unknown-barcode form** (`shop_unknown`): `barcode` (canonical), Ingredient (`ingredient.id` or `ingredient.{name, baseUnit}` find-or-create by name key), `packSize` in the Ingredient's Base Unit (the sheet converts "1 kg" with `lib/units`), `productName` (prefilled `defaultProductName`), `scope` `global | shop`. **A weighed code** (`unknown_weighed_product`: `ruleId` + `itemCode`) takes only Ingredient and `productName`; the Product's nominal `packSize` = the decoded weight of this first scan, the Shop Barcode stored is `{ruleId, itemCode}`. **A price-valued rule** with no price per kg also needs the weight once (`quantity` grams), and the Price is recorded with `pricePerKgCents = barcode.PricePerKgFromWeight(price, grams)`. The same `ask_weight` rule applies to a known Product (`shop_scan` with `quantity` = the asked weight and `priceCents` + `pricePerKgCents`).
- **Merge** (second creation of one barcode): when creating hits `barcode_taken` (T9) the op does not fail; it applies the scan to the Product that already owns the code and returns `merged: {productId, productName}`. The SPA shows the notice "Someone already added this barcode; yours was merged into <name>" unless the first creation was in the same sync batch.
- **Stock-take**: `plus_pack` adds a Lot of the Product's pack size (source `scan`, product, no shop, no purchase); `minus_pack` sets the total to `max(0, total - pack)`; `set_total` sets the total (T10 `SetTotal`). The result carries the Ingredient `total` after. Not part of the Shopping List and never undoable.
- **Sync** (`POST /api/scan/sync`): ops are applied **in the order given**, one by one; a rejected op (validation, unknown Product) gets `status: "rejected"` with its error and does not stop the rest; a network failure stays on the phone. Results are in the same order. Replaying a whole batch is safe.
- **Live updates**: topic `shopping` events `{"changed":"list|ticks|extras|scan"}`; the SPA also invalidates the list on `plan`, `stock`, `products` and on reconnect. Two shoppers see each other's ticks within ~1 s because every write publishes before answering.
- **Offline data**: `GET /api/scan/offline?shop=` returns what the phone needs to resolve and describe a scan offline: the T9 `barcode.Catalog` for the Shop (or home), the Products (id, name, ingredient, base unit, pack size) and the latest Price per Product at the Shop. The SPA stores the offline data, the last Shopping List per `(shop, to)` and the op queue in IndexedDB (`idb`). The **service worker** only precaches the app shell and static assets and serves `index.html` for navigations; data is the SPA's job (testable, no stale API surprises).
- **Service worker ownership** (`vite-plugin-pwa`, `strategies: 'injectManifest'`, `srcDir: 'src/sw'`, `filename: 'sw.ts'`): `sw.ts` precaches the manifest and then loads every module in `src/sw/extensions/*.ts` through `import.meta.glob('./extensions/*.ts', { eager: true })`; an extension exports `register(sw: ServiceWorkerGlobalScope): void` and adds its own listeners (`push`, `notificationclick`). The notifications team adds `src/sw/extensions/push.ts` and edits no other file. `src/sw/cache.ts` holds the pure URL classification (`isAppShell`, `isApi`), unit-tested.
- **Camera**: `Detector` interface (`detect(frame) -> Detection[]`) with `createNativeDetector(BarcodeDetector)` and `createZxingDetector(@zxing/browser)`; `chooseDetector` picks native when available. `useCamera` (stream, torch capability and toggle) and `useScanner` (loop, cooldown de-duplication, pause while a sheet is open) consume the interface, so tests use a fake. GS1 Digital Link and other QR content go through `lib/barcode.parse` (`not_product` -> toast "not a product code"). Feedback: `createFeedback({ audio, vibrate, isMuted })`; vibration only where `navigator.vibrate` exists (never on iOS), the beep always unless muted; the mute is per device (`localStorage`).
- **Scan session active**: `useScanSessionActive()` (module-level store, `useSyncExternalStore`) is true while the Scan screen is mounted in Shop mode; Home can switch to the list later (exported from `features/scan/index.ts`).
- **Last Shop used** is per device (`localStorage`), chosen on the Scan screen's Shop picker.
- **Money/quantity formatting** reuses `products/lib/money` (`formatMinor`, `parseMajor`) and `products/lib/names` (`defaultProductName`, `formatPackSize`); quantities use `lib/units`.

## Data (migration `internal/db/migrations/0800_shopping_scan.sql`, written in this commit)
`shopping_extras(id, text | ingredient_id+quantity, got, created_at, ticked_on)`, `shopping_ticks(range_to, ingredient_id, needed, by scan|hand, lot_id, ticked_at; PK range_to+ingredient)`, `scan_events(client_uuid PK, kind, scanned_at, applied_at, seq, shop_id, product_id, ingredient_id, quantity, price_cents, range_to, on_list, ticked, lot_id, purchase_id, sold_at_added, price_id, prev_price_json, product_created, merged_into, result_json, undone_at)`. A "mover" registers `"shopping"` with the Ingredient merge (re-points `shopping_extras`, `shopping_ticks`, `scan_events.ingredient_id`), like T10's `mover.go`.

## API (JSON camelCase; all `r.User`; errors `{"error":{"code","message"}}`; 422 `validation_failed`, 404 `not_found`)
List view = `{today, horizonDays, from, to, defaultTo, maxTo, currency, lines:[Line], extras:[Extra], progress:{ticked,total}, estimatedCostCents, unpricedLines, complete, summary:{lines,spentCents,lotsAdded}}`. Line = `{ingredientId, name, baseUnit, need, available, quantity, ticked, pack:{productId,name,size,count,remainder}|null, estimatedCostCents|null}`. Extra = `{id, text|null, ingredientId|null, name|null, baseUnit|null, quantity|null, ticked}` (`quantity` = remaining).

| Route | Result |
|---|---|
| `GET /api/shopping/list[?shop=ID&to=DATE]` | List view; `to` clamped; 404 unknown shop |
| `POST /api/shopping/extras` `{text}` or `{ingredientId, quantity}` | 201 Extra; 422 (both/neither, blank text, quantity <= 0), unknown Ingredient 422 `unknown_ingredient` |
| `DELETE /api/shopping/extras/{id}` | 204; 404 |
| `POST /api/shopping/extras/{id}/tick` `{quantity?}` / `DELETE` | 200 Extra (an Ingredient extra with `quantity > 0` also adds a Stock Lot); DELETE unticks |
| `POST /api/shopping/ticks` `{ingredientId, to, quantity, shopId?, clientUuid?}` | 200 `{ticked:true, lotId|null, created}`; repeated `clientUuid` adds no second Lot; 422 negative `quantity` |
| `DELETE /api/shopping/ticks?ingredientId=&to=` | 204 |
| `GET /api/scan/offline[?shop=ID]` | `{shopId, shopName, catalog: barcode.Catalog, products:[{id,name,ingredientId,ingredientName,baseUnit,packSize,lastPriceCents|null}]}` |
| `POST /api/scan` `Op` | 200 `Result` (`applied` or `duplicate`); 422 `rejected` ops answer `{status:"rejected", error}` with status 422 |
| `POST /api/scan/sync` `{ops:[Op]}` | 200 `{results:[Result]}` same order |
| `POST /api/scan/{clientUuid}/undo` | 200 `{undone:true, alreadyUndone?}`; 404; 409 `not_undoable` |
| `PATCH /api/scan/{clientUuid}` `{priceCents}` | 200 Result; 404; 422 |

`Result` = `{clientUuid, status: applied|duplicate|rejected, error?:{code,message}, scan?:{ingredientId, ingredientName, baseUnit, productId, productName, quantity, lotId|null, priceCents|null, onList, remaining, ticked, productCreated, merged?:{productId, productName}, total?}}`.

## Go layout and signatures (tests rely on these)
```go
// internal/shopping (pure)
type Need struct{ IngredientID int64; Quantity float64; Optional bool }       // per Batch, Base Units
type Meal struct{ Date stock.Date; At time.Time; Batches float64; Leftover bool; Needs []Need }
type IngredientInfo struct{ Name, BaseUnit string }
type Pack struct{ ProductID int64; Name string; Size float64 }
type Extra struct{ ID int64; Text string; IngredientID int64; Quantity, Got float64; Ticked bool }
type Tick struct{ IngredientID int64; Needed float64; By string }
type Input struct{ Now time.Time; From, To stock.Date; Meals []Meal; Lots []stock.Lot; Ingredients map[int64]IngredientInfo
                   Packs map[int64]Pack /*by Ingredient*/; PackPrices map[int64]int /*by Product*/; Extras []Extra; Ticks map[int64]Tick }
type PackSuggestion struct{ ProductID int64; Name string; Size float64; Count int; Remainder float64 }
type Line struct{ IngredientID int64; Name, BaseUnit string; Need, Available, Quantity float64; Ticked bool; Pack *PackSuggestion; EstimatedCostCents *int }
type ExtraLine struct{ ID int64; Text string; IngredientID int64; Name, BaseUnit string; Quantity float64; Ticked bool }
type Progress struct{ Ticked, Total int }
type List struct{ From, To stock.Date; Lines []Line; Extras []ExtraLine; Progress Progress; EstimatedCostCents, UnpricedLines int; Complete bool }
func Derive(in Input) List        // open Lines by name then id, then ticked Lines; Extras open first in id order
func (l List) LineFor(ingredientID int64) (Line, bool)
func SuggestPack(quantity float64, p Pack) PackSuggestion
func LastPlannedDate(today stock.Date, horizonDays int) stock.Date
func DefaultTo(today stock.Date, horizonDays int) stock.Date
func ClampTo(today stock.Date, horizonDays int, to stock.Date) stock.Date

// internal/shopping/store
func New(db *sql.DB, clk clock.Clock) *Store
// extras: AddTextExtra(ctx, text) / AddIngredientExtra(ctx, ingredientID, qty) (shopping.Extra, error); Extras(ctx, today) ([]shopping.Extra, error) (open + ticked today);
//   DeleteExtra, TickExtra(ctx, id, today), UntickExtra, AddGot(ctx, id, delta) (Extra, error); ErrNotFound
// ticks: SetTick(ctx, range_to, Tick, lotID *int64), DeleteTick(ctx, range_to, ingredientID), Ticks(ctx, range_to) (map[int64]shopping.Tick, error), PurgeBefore(ctx, today), LotsAdded(ctx, range_to) (int, error)

// internal/shopping/service (ports)
type Plan interface{ Meals(ctx, from, to stock.Date) ([]shopping.Meal, error) }
type Stock interface{ Lots(ctx) ([]stock.Lot, error); AddLot(ctx, StockAdd) (lotID int64, created bool, err error) }
type StockAdd struct{ IngredientID int64; Quantity float64; ShopID *int64; ClientUUID string }
type Products interface{ LastBought(ctx, ingredientIDs []int64, shopID *int64) (map[int64]shopping.Pack, error)
                         PackPrices(ctx, productIDs []int64, shopID *int64) (map[int64]int, error); ShopExists(ctx, id int64) (bool, error) }
type Ingredients interface{ Info(ctx, ids []int64) (map[int64]shopping.IngredientInfo, error) }   // missing id = unknown
type Household interface{ Today(ctx) (stock.Date, error); HorizonDays(ctx) (int, error); Currency(ctx) (string, error) }
type Ledger interface{ Totals(ctx, rangeTo stock.Date) (spentCents, lots int, err error) }
type Publisher interface{ Publish(topic string, data any) }
func New(st *store.Store, p Ports, clk clock.Clock, pub Publisher) *Service
func (s *Service) List(ctx, Query{ShopID *int64; To stock.Date}) (View, error)
func (s *Service) Tick(ctx, TickInput) (TickResult, error); Untick(ctx, ingredientID int64, to stock.Date) error
func (s *Service) AddExtra / DeleteExtra / TickExtra / UntickExtra
func (s *Service) AfterLot(ctx, AfterLotInput{IngredientID int64; To stock.Date; ShopID *int64; Quantity float64}) (Effect, error)   // scan's ListPort
func (s *Service) UndoLot(ctx, UndoLotInput{IngredientID int64; To stock.Date; Quantity float64; Unmark bool}) error
type Effect struct{ OnList bool; Remaining float64; Ticked bool }
var ErrUnknownIngredient, ErrUnknownShop, ErrNotFound, ErrInvalid error

// internal/scan (pure)
type Kind string  // KindShopScan, KindShopUnknown, KindStockTake
type Op struct{...}   // fields as in the design; JSON camelCase
func (o Op) Validate() error      // *ValidationError{Field}; errors.Is(err, ErrInvalid)
type Result struct{...}; type Applied struct{...}

// internal/scan/store: Ledger over scan_events
func New(db *sql.DB, clk clock.Clock) *Store
// Get(ctx, uuid) (Event, bool, error); Insert(ctx, Event) error (ErrDuplicate); MarkUndone(ctx, uuid) error; UpdatePrice(ctx, uuid, cents int); Totals(ctx, rangeTo) (spent, lots int, err error)

// internal/scan/service (ports)
type Stock interface{ AddLot(ctx, StockAdd) (lotID int64, created bool, err error); RemoveLot(ctx, id int64) error; Total(ctx, ingredientID int64) (float64, error); SetTotal(ctx, ingredientID int64, total float64) error }
type Catalogue interface{ Product(ctx, id) (ProductInfo, error); CreateProduct(ctx, NewProduct) (ProductInfo, error) /* *BarcodeTakenError{ProductID} */
     SoldAt(ctx, productID, shopID int64) (bool, error); SetSoldAt/UnsetSoldAt; RecordPurchase(ctx, productID int64, shopID *int64, date stock.Date) (int64, error); DeletePurchase
     LatestPrice(ctx, productID, shopID int64) (*PriceInfo, error); RecordPrice(ctx, productID int64, PriceInput) (PriceInfo, error); DeletePrice(ctx, id int64) error
     OfflineData(ctx, shopID *int64) (OfflineData, error) }
type Ingredients interface{ Ensure(ctx, name, baseUnit string) (id int64, err error) }
type List interface{ AfterLot(...) (shopping.Effect-like, error); UndoLot(...) error }   // implemented by shopping/service
func New(Deps) *Service
func (s *Service) Apply(ctx, scan.Op) (scan.Result, error)       // error only for infrastructure failures; a bad op is Result{Status: rejected}
func (s *Service) Sync(ctx, []scan.Op) ([]scan.Result, error)
func (s *Service) Undo(ctx, clientUUID string) (UndoResult, error)   // ErrNotFound, ErrNotUndoable
func (s *Service) SetPrice(ctx, clientUUID string, cents int) (scan.Result, error)
func (s *Service) OfflineData(ctx, shopID *int64) (OfflineData, error)
```
`Fake*` ports for tests live in `internal/shopping/service/fakes_test.go` and `internal/scan/service/fakes_test.go` (test files, not shared).

## Frontend
`web/src/features/shop/` (route `/shop`, bottom bar "Shop"; `index.ts` exports `routes` only, written by the Developer): `screens/ShoppingScreen` (named so it is not confused with `shops/ShopScreen`) = `BentoGrid` of `ProgressTile` ("Lines ticked"), `components/CostTile`, `components/RangePicker` (chips from today to the Planning Horizon, `lib/range`), open `components/LineTile`s (`lib/lines.listEntries`: Lines then extras), a "Ticked" group, `components/ExtraSheet` ("Add an extra"), `components/TickSheet` ("How much?" prefilled with the remaining quantity) and `components/CelebrationTile` ("Shopping list complete": Lines, spent, Lots; no animation under reduced motion). `hooks/useShoppingList` (react-query under `['shopping', ...]`, one SSE connection on `shopping|plan|stock|products` + reconnect, IndexedDB snapshot as the offline fallback with `stale`), `hooks/useShoppingActions` (each tick by hand sends a fresh client UUID). `api.ts`, `types.ts`, `strings.ts`, `testData.ts` are written (declarative).
`web/src/features/scan/` (route `/scan`, centre button; `index.ts` exports `routes` and `useScanSessionActive`/`useScanSession`): `screens/ScanScreen` (ShopPicker, then `ui/ViewfinderStrip` above a compact live list, `ScanFeedback`, sheets, offline/sync notices) over `hooks/useScanController` (composes offline cache, camera, detector, scanner, queue, flow, live list). Components: `ShopPicker`, `ScanFeedback`, `PriceEditSheet`, `UnknownBarcodeSheet`, `AskWeightSheet`, `StockTakeSheet`, plus a `LiveList` the Developer adds. Hooks: `useCamera` (stream, torch), `useScanner` (loop, cooldown, no overlap), `useScanFlow` (read -> Op / sheet / banner, Undo, edit price), `useSyncQueue` (flush on mount, `online`, after enqueue), `useScanSessionActive`/`useScanSession`. Lib (plain TS): `barcode.ts` (exists, untouched), `resolveScan` (`planScan`, `applyAskedWeight`), `queue` (`OfflineQueue`, `OpStore`, `createMemoryOpStore`, `newClientUuid`), `idbStore` (IndexedDB glue, untested), `snapshots`, `lastShop`, `toast` (`feedbackText`), `unknownForm`, `feedback` (beep/haptic/mute), `cooldown`, `notices`, `detector` (`Detector`, `createNativeDetector`, `chooseDetector`, `toScanned`). `api.ts`, `types.ts`, `strings.ts` are written (declarative). New shared primitive: `web/src/ui/ViewfinderStrip.tsx` (+ export in `ui/index.ts`, strings in `ui/strings.ts`).
`web/src/sw/`: `sw.ts` (entry; precache from `self.__WB_MANIFEST` and navigation fallback implemented with the Cache API directly, so no `workbox-*` runtime packages are needed and `package.json` stays untouched; if the Developer prefers Workbox, `workbox-precaching`/`workbox-routing` must be added to `package.json`, a shared file), `cache.ts` (`classifyRequest`), `extensions.ts` (`registerExtensions`), `extensions/` (empty; notifications adds `push.ts`). `vite.config.ts` change (Developer): `VitePWA({ strategies: 'injectManifest', srcDir: 'src/sw', filename: 'sw.ts', registerType: 'autoUpdate', manifest: { name: 'Feeder', short_name: 'Feeder', display: 'standalone', start_url: '/', icons } })`, and `scan/registerSw.ts` registers the worker (production builds only).

## Shared files touched (minimal)
`web/vite.config.ts` (PWA plugin), `web/src/ui/{ViewfinderStrip.tsx,index.ts,strings.ts}` (new primitive + export), `internal/stock/service` + `internal/stock/store` (`RemoveLot`/`DeleteLot`, needed by Undo), `internal/modules/{shopping,scan}.go` (new), `internal/testkit` only if the planning wiring needs it after the T11 sync.

## Tests
- Go: `internal/shopping/{derive,range,pack}_test.go`, `internal/shopping/store/store_test.go`, `internal/shopping/service/service_test.go` (+fakes), `internal/scan/scan_test.go`, `internal/scan/store/store_test.go`, `internal/scan/service/service_test.go` (+fakes), `internal/{shopping,scan}/httpapi/httpapi_test.go`.
- BDD `bdd/features/shopping-scan/{shopping_list,shop_scan,unknown_barcode,stock_take,offline_sync,two_shoppers}.feature`, steps `bdd/steps_shopping_scan_test.go` (`RegisterSteps("shopping-scan")`; step text about the Shopping List, Scan and Stock Lots only; the plan fixtures go through T11's `PUT /api/plan/{date}/{slotId}`, so list scenarios are red until T11 is synced; the scan scenarios do not need a plan).
- vitest next to the code (listed per file in the commit).

## Naming decisions (Glossary `_Avoid_` review)
- A Line's estimated total is `estimatedCostCents` (spec §9 "estimated cost"); never "cost" for a Price. Steps: `"X" has a Price of N cents at "Shop"`, `the line "x" has an estimated cost of N cents`.
- List rows are "Lines" (`LineTile`, `ListEntry`, `listEntries`; summary `lines`), never "items". Ticked rows form the "Ticked" group; `progress.ticked`. "Done" is not used (it is `_Avoid_` for Cooked).
- "store" only as the Go SQL repository package and the technical IndexedDB/op store; a Shop is always "Shop".
