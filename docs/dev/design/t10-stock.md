# T10 stock: design

Scope: functional-spec §6 (Stock), ADR 0003, GLOSSARY *Stock*, *Stock Lot*, *Stock-take*, *Shelf Life*. Contract: [../architecture.md](../architecture.md); pure rules already on main: [t4-domain-libs.md](t4-domain-libs.md) (`internal/stock`: `Deduct`, `CookedNeeds`, `SetTotal`, `Spoiled`, `Keep`). **This team never re-implements those.** Tests first (red); the Developer implements until `scripts/check.sh` passes.

**Merge order.** T1 (household time zone) and T2 (Ingredients, `ReferenceMover`) are not on this branch. The tests here use only HTTP and raw SQL against `ingredients` (migration 0200), so the PM must merge main with T1 + T2 before the Developer starts. Two pieces are written against T2/T1 APIs but guarded by the build tag `t2merged` (Developer removes the tag line when T2 is merged): `internal/stock/store/mover.go` + `mover_test.go`. The T1 "today" adapter lives in `internal/stock/httpapi/wiring.go` (Developer writes it; stubbed to UTC here).

## Decisions taken
- **"Today"** = the household-time calendar date of the injected clock (`household` store `Settings().TimeZone`). The service takes a `Today func(ctx) (stock.Date, error)`; nothing in the service calls `time.Now`.
- **Layers**: `internal/stock` (pure, no SQL) gains `message.go` (quantity text, shortfall wording, use-soon, projection). `internal/stock/store` (SQL), `internal/stock/service` (orchestrates store + pure rules + events + Ingredient lookup through small interfaces, so it is unit-testable without T1/T2), `internal/stock/httpapi` (thin).
- **Atomic changes**: every mutation of one Ingredient's lots runs in one transaction through `Store.Update(ctx, ingredientID, fn)`: it loads that Ingredient's lots, calls `fn`, then persists the returned set (same ID, changed quantity/go-off -> UPDATE; ID missing from the result -> DELETE; ID 0 -> INSERT with the Mutation's source) and any waste records. `fn` is the pure `stock` function, so rules stay out of SQL.
- **Source**: `scan | stock_take | manual` (column `source`). The HTTP add route accepts `manual` (default) and `scan`; `stock_take` is set only by Set total.
- **Go-off date** of a new lot = `stock.NewLot(purchased, Shelf Life)`; `purchased` defaults to today and may be set (past dates allowed, future rejected `validation_failed`).
- **Idempotent scans**: `client_uuid` is UNIQUE and nullable. Adding a lot with a `clientUuid` that already exists returns the existing lot with status 200 (first time 201), no second lot, no event.
- **Product / Shop** are plain nullable INTEGER columns (`product_id`, `shop_id`), no foreign keys (T5 owns those tables; the scan team fills them). The API stores and returns them untouched.
- **Waste** table `stock_waste` (Ingredient, quantity, date, reason `spoiled | leftover_expired`, optional lot id). `RecordWaste` is also exposed to Planning for auto-discarded Leftovers (`leftover_expired`; `ingredient_id` is nullable for those, see QUESTIONS in the report). Throw out writes `spoiled`. The zero-waste streak reads this table later (not this team).
- **Throw out / Keep** are only allowed on a spoiled lot (go-off before today): otherwise `409 not_spoiled`. Keep = `stock.Keep` (+1 day from the existing go-off date, so a lot several days overdue stays spoiled and is listed again).
- **DeductForCooked never blocks**: unknown or non-positive needs are skipped, shortfalls become warnings, Stock floors at 0. It returns warnings, not an error, for short Stock; an error only for database failure. Idempotency (not deducting twice) is Planning's job (it calls once on the Cooked transition).
- **One-tap Stock correction** = the existing Set total route, prefilled by the SPA with the post-cook total (0 when floored). No separate endpoint. Dismissing the notice changes nothing (Stock is already floored).
- **Use soon**: lot goes off today or within `stock.UseSoonDays` (3) days and is not yet spoiled. Shown with the fixed spoil status colour (`tone="spoil"`), never an accent colour.
- **Projected lots** read model: `service.Projected(ctx)` / `GET /api/stock/projected` returns the current lots grouped by Ingredient in consumption order with go-off dates. Planner and Shopping List adjust it themselves (planned purchases and consumption); `stock.Project(lots).Available(ingredient, on)` gives the Shopping List's "lots still within their go-off date on the date each meal needs them".
- **Events**: topic `stock`, data `{"changed":"lots","ingredientIds":[...]}` after add, Set total, deduct (only if something changed), throw out, keep. Waste-only writes publish `{"changed":"waste"}`.
- **Everyone signed in** can use all Stock routes (`r.User`), like Ingredients.
- **Mover** ("stock lots"): `Count` = lots + waste rows of the Ingredient; `Move` re-points `stock_lots` and `stock_waste` (lots simply re-point: two lots of the merged Ingredient coexist).

## Data (migration `internal/db/migrations/0500_stock.sql`)
```sql
CREATE TABLE stock_lots (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  quantity REAL NOT NULL CHECK (quantity > 0),       -- Base Units
  purchased TEXT NOT NULL,                           -- YYYY-MM-DD, household time
  goes_off TEXT,                                     -- YYYY-MM-DD or NULL
  source TEXT NOT NULL CHECK (source IN ('scan','stock_take','manual')),
  product_id INTEGER, shop_id INTEGER,
  client_uuid TEXT UNIQUE,
  created_at TEXT NOT NULL);                         -- RFC 3339 UTC
CREATE INDEX stock_lots_ingredient ON stock_lots(ingredient_id);
CREATE TABLE stock_waste (
  id INTEGER PRIMARY KEY,
  ingredient_id INTEGER REFERENCES ingredients(id),
  quantity REAL NOT NULL CHECK (quantity >= 0),
  wasted_on TEXT NOT NULL,                           -- YYYY-MM-DD
  reason TEXT NOT NULL CHECK (reason IN ('spoiled','leftover_expired')),
  lot_id INTEGER,                                    -- informational, no FK (the lot is gone)
  created_at TEXT NOT NULL);
```

## Go layout and signatures (tests rely on these)
```go
// internal/stock (pure) message.go
const UseSoonDays = 3
func FormatQuantity(q float64, base string) string                      // "300 g", "1.5 ml", "1 piece", "2 pieces"; <= 2 decimals, trailing zeros trimmed
func ShortfallMessage(name, base string, have, need float64) string     // "Stock shows only 300 g chicken thighs, the recipe uses 800 g"; have 0: "Stock shows no chicken thighs, the recipe uses 800 g"
func UseSoon(lots []Lot, today Date, days int) []Lot                    // GoesOff in [today, today+days], ordered by go-off then ID
type ProjectedStock map[int64][]Lot
func Project(lots []Lot) ProjectedStock                                 // per Ingredient, in consumption order (Deduct order)
func (p ProjectedStock) Available(ingredientID int64, on Date) float64  // lots with no go-off or GoesOff >= on

// internal/stock/store
type Source string                        // SourceScan, SourceStockTake, SourceManual
type StoredLot struct{ stock.Lot; Source Source; ProductID, ShopID *int64; ClientUUID string; CreatedAt time.Time }
type NewLot struct{ IngredientID int64; Quantity float64; Purchased, GoesOff stock.Date; Source Source; ProductID, ShopID *int64; ClientUUID string }
type Reason string                        // ReasonSpoiled, ReasonLeftoverExpired
type WasteRecord struct{ ID int64; IngredientID *int64; Quantity float64; WastedOn stock.Date; Reason Reason; LotID *int64 }
type Mutation struct{ Lots []stock.Lot; NewSource Source; Waste []WasteRecord }
var ErrNotFound, ErrDuplicateUUID error
func New(db *sql.DB, clk clock.Clock) *Store
func (s *Store) AddLot(ctx, NewLot) (lot StoredLot, created bool, err error)   // idempotent on ClientUUID
func (s *Store) Lot(ctx, id int64) (StoredLot, error)                         // ErrNotFound
func (s *Store) Lots(ctx, ingredientID int64) ([]StoredLot, error)            // 0 = all; ordered by go-off (NULL last), purchased, id
func (s *Store) Update(ctx, ingredientID int64, fn func([]stock.Lot) (Mutation, error)) ([]StoredLot, error)
func (s *Store) AddWaste(ctx, WasteRecord) (WasteRecord, error)
func (s *Store) Waste(ctx, from, to stock.Date) ([]WasteRecord, error)       // inclusive, empty bound = open
// mover.go (tag t2merged): type Mover; init() registers "stock lots" with ingredient store.RegisterMover

// internal/stock/service
type IngredientInfo struct{ ID int64; Name, BaseUnit string; ShelfLifeDays *int }
type Ingredients interface{ Ingredient(ctx, id int64) (IngredientInfo, error) }  // ErrUnknownIngredient
type Today func(ctx context.Context) (stock.Date, error)
type Publisher interface{ Publish(topic string, data any) }                     // *events.Bus
var ErrUnknownIngredient, ErrNotSpoiled, ErrInvalid error  // ErrInvalid wrapped with a message
func New(st *store.Store, ing Ingredients, today Today, pub Publisher) *Service
type AddInput struct{ IngredientID int64; Quantity float64; Purchased stock.Date; Source store.Source; ProductID, ShopID *int64; ClientUUID string }
type LotView struct{ store.StoredLot; IngredientName, BaseUnit string; Spoiled, UseSoon bool }
type IngredientStock struct{ IngredientID int64; Name, BaseUnit string; Total float64; LotCount int; NextGoesOff stock.Date; UseSoon bool; SpoiledCount int }
type Warning struct{ IngredientID int64; Name, BaseUnit string; Have, Need, Shortfall float64; Message string }
func (s *Service) AddLot(ctx, AddInput) (LotView, bool, error)
func (s *Service) SetTotal(ctx, ingredientID int64, total float64) (IngredientStock, error)  // via stock.SetTotal; new lot source stock_take
func (s *Service) Totals(ctx) ([]IngredientStock, error)                    // Ingredients with Stock > 0, ordered: use-soon/spoiled first, then name
func (s *Service) Lots(ctx, ingredientID int64) ([]LotView, error)
func (s *Service) Spoiled(ctx) ([]LotView, error)
func (s *Service) ThrowOut(ctx, lotID int64) (store.WasteRecord, error)    // ErrNotFound, ErrNotSpoiled
func (s *Service) Keep(ctx, lotID int64) (LotView, error)
func (s *Service) DeductForCooked(ctx, needs []stock.Need) ([]Warning, error)
func (s *Service) Projected(ctx) (stock.ProjectedStock, error)
func (s *Service) RecordWaste(ctx, in store.WasteRecord) (store.WasteRecord, error)
func (s *Service) Waste(ctx, from, to stock.Date) ([]store.WasteRecord, error)

// internal/stock/stocktest: NewDB(t) *sql.DB (migrated temp SQLite), SeedIngredient(t, db, name, base string, shelfLifeDays *int) int64
```

## API (JSON camelCase; all `r.User`; errors `{"error":{"code","message"}}`)
Lot = `{id, ingredientId, ingredientName, baseUnit, quantity, purchased, goesOff|null, source, productId|null, shopId|null, spoiled, useSoon}`.

| Route | Result |
|---|---|
| `GET /api/stock` | `{ingredients:[{ingredientId, name, baseUnit, total, lotCount, nextGoesOff\|null, useSoon, spoiledCount}]}` |
| `GET /api/stock/lots[?ingredientId=]` | `{lots:[Lot]}` |
| `POST /api/stock/lots` `{ingredientId, quantity, purchased?, source?, productId?, shopId?, clientUuid?}` | 201 Lot (200 same Lot on repeated `clientUuid`); 422 `validation_failed` (quantity <= 0, future date, bad source, bad date); 422 `unknown_ingredient` |
| `PUT /api/stock/ingredients/{id}/total` `{total}` | 200 `{ingredient: IngredientStock, lots:[Lot]}`; 422 `validation_failed` (negative); 422 `unknown_ingredient` |
| `GET /api/stock/spoiled` | `{lots:[Lot]}` ordered by go-off then id |
| `POST /api/stock/lots/{id}/throw-out` | 200 waste record `{id, ingredientId, quantity, wastedOn, reason, lotId}`; 404 `not_found`; 409 `not_spoiled` |
| `POST /api/stock/lots/{id}/keep` | 200 Lot; 404; 409 `not_spoiled` |
| `POST /api/stock/cooked` `{needs:[{ingredientId, quantity}]}` | 200 `{warnings:[{ingredientId, name, baseUnit, have, need, shortfall, message}]}`; never 4xx for short Stock. (Planning calls the service directly; the route exists for BDD and the SPA.) |
| `GET /api/stock/projected` | `{ingredients:[{ingredientId, lots:[{id, quantity, goesOff\|null}]}]}` consumption order |
| `GET /api/stock/waste[?from=&to=]` | `{records:[...]}` |

## Frontend (`web/src/features/stock`)
Route `/stock` (the shell already has the fixed avatar-menu item "Stock", so `index.ts` exports routes only).
- `api.ts` (`createStockApi(http)`, `stockApi`), `types.ts`, `strings.ts`.
- `lib/` (pure): `amount.ts` (`formatAmount(q, base)` metric-only wording; swapped for T2's `formatQuantity` with the imperial preference when merged), `view.ts` (`describeGoOff(goesOff, today)` -> `{label, tone}` ("Goes off in 2 days", "Goes off today", "Went off 3 days ago"; tone `spoil` for use-soon and spoiled, `neutral` otherwise), `sortTotals`, `parseTotal(text)` -> number or error key), `shortfall.ts` (`correctionDefault(warning)`).
- `hooks/`: `useStock` (totals), `useStockLots(ingredientId)`, `useSpoiledLots` (list + `throwOut`, `keep`), `useStockActions` (`addLot`, `setTotal`), all react-query, invalidating `['stock']` and subscribing to the `stock` SSE topic.
- `components/` (render + wire only, composed from `Tile`, `BentoGrid`, `Chip`, `BottomSheet`, `Button`, `EmptyState`, `Stepper`, `Toast`): `StockTile` (Ingredient total + use-soon `Chip tone="spoil"`), `LotList` (lot detail rows), `AddLotSheet`, `SetTotalSheet`, `SpoiledTile` (**exported for Today**: props `lots`, `onThrowOut(id)`, `onKeep(id)`; heading "Throw out or keep?"; renders nothing when no lots; spoil tone), `ShortfallNotice` (the warning text with "Correct Stock" and "Dismiss").
- `screens/StockScreen.tsx`: `BentoGrid` of `StockTile`s (use-soon first, `lg` size), `SpoiledTile` on top when there are spoiled lots, "Add" button -> `AddLotSheet`, tile tap -> `BottomSheet` with `LotList` + "Set total". `EmptyState` when nothing in Stock ("Nothing in Stock yet").
- `index.ts` also re-exports `SpoiledTile` and `useSpoiledLots` for the Today team.

## Tests
- Go pure: `internal/stock/message_test.go`. Store: `internal/stock/store/store_test.go` (+ `mover_test.go`, tag `t2merged`). Service: `internal/stock/service/service_test.go`. HTTP: `internal/stock/httpapi/httpapi_test.go` (external package). BDD: `bdd/features/stock/{stock_lots,stock_take,cooked_deduction,spoiled}.feature`, `bdd/steps_stock_test.go` (`RegisterSteps("stock")`, step text about "Stock Lot"/"Stock" only).
- vitest next to the code: `lib/*.test.ts`, `api.test.ts`, `components/*.test.tsx`, `screens/StockScreen.test.tsx`.
