# T9 products and shops: design

Scope: functional-spec §5 (Product, Shop, Shop Barcodes, Weight Barcode Rules, Prices), the server side of §10.1/§10.3 (barcode resolution, the offline Catalog), and the "last bought Product for an Ingredient" query used by §7.2 and §9. GLOSSARY words: Product, Shop, Shop Barcode, Weight Barcode Rule, Price. Never "SKU", "store" (as a place), "cost".

**Build order.** This branch reads tables and APIs of T1 (`household_settings.currency`, Admin role) and T2 (`ingredients`, `ReferenceMover`). Its tests compile and pass only after T1 and T2 are merged into the branch (the PM merges main first). Only `internal/product/store/mover.go` imports T2 Go code (a one-line `RegisterMover`); it is deliberately **not** in the stubs, the Developer adds it after the merge (see Integration).

## Decisions taken
- **One module, three packages**: `internal/product` (pure: types, validation, price maths, Catalog builder; Shops included), `internal/product/store` (`Store` over SQLite), `internal/product/httpapi` (module `products`, file `internal/modules/products.go`). The brief allows one combined package; Shops are too small for their own.
- **Who may do what.** Shops and Weight Barcode Rules: Admin writes, any User reads. Everything else (Products, global and Shop Barcodes, Prices, purchases, catalog, resolve): any signed-in User, because the scan sheet creates Products and Shop Barcodes in the shop.
- **Barcodes are stored canonical** (`barcode.Canonical`: GTIN-14 or opaque string). Invalid input is `400 invalid_barcode`. A global barcode is unique across Products (`409 barcode_taken`, message carries the owning product id as `productId` in the message text "barcode already belongs to product 7"); a Shop Barcode is unique within its Shop. The same code may be a global barcode of one Product and a Shop Barcode of another (resolution order says Shop Barcode wins).
- **Shop Barcodes** are plain (`code`) or weighed (`ruleId` + `itemCode`, the digits read from the rule's item span; length must equal the rule's `item.length`). Weighed ones feed `Catalog.weightProducts`, plain ones `Catalog.shopBarcodes`.
- **Weight Barcode Rules**: validated by `barcode.WeightRule.Validate`. Prefix is unique per Shop (`409 duplicate_prefix`; different but overlapping prefixes such as `29` and `290` are fine). Changing a rule's item span length while weighed Shop Barcodes exist is `409 in_use`; deleting a rule deletes its weighed Shop Barcodes. A price rule has no `valueUnit` (minor unit of the household Currency).
- **Prices.** A Price is Product x Shop x date, unique per triple (PUT on the same day replaces). It carries `priceCents` (what a pack cost; optional) and/or `pricePerKgCents` (optional; recorded for weighed goods, e.g. after `ask_weight`). At least one is required, both > 0. **Price per kg of a Price** = its explicit `pricePerKgCents`, else derived from `priceCents` when the Ingredient's Base Unit is `g` and the Product has a pack size (`priceCents * 1000 / packSize`, rounded half up), else none. **Latest Price** = highest date, then highest id. Recording a Price also records the Product as sold at that Shop.
- **Catalog.pricePerKgCents** holds, for each Product reachable through this Shop's weighed Shop Barcodes (`weightProducts`), the `pricePerKgCents` of the **most recent Price at that Shop that has an explicit `pricePerKgCents`** (`product.LatestExplicitPricePerKg`: highest date, then highest id, among Prices with an explicit value). A newer pack-only Price never masks it. **Pack-size derivation is never used for weighed Products**: a nominal pack size says nothing about a price-labelled slice (spec §5: "the Product's last known price per kg at that Shop"). Without an explicit price per kg the entry is absent and the price-valued scan asks for the weight once (`ask_weight`); recording that weight as an explicit price per kg makes the next scan decode. Derivation stays only in `product.PricePerKg`, for displaying a Price's per-kg figure (`pricePerKgDerived`) in the Product screen. Plain products are left out to keep the offline cache small. `CatalogRows` carries `Prices map[int64][]Price` (all Prices of the weighed Product at this Shop); `Latest` and `Info`/`ProductInfo` go away.
- **Purchases (the "last bought" source).** Spec §7.2/§9 say "the Product last bought". The stock team owns Stock Lots; to avoid depending on them this team owns a tiny purchase log, `purchases(product, shop|null, bought_on)`, which the scan/shopping team writes through `POST /api/purchases` (or `Store.RecordPurchase`) every time a resolved scan adds a Lot at a Shop or at home, and removes on Undo (`DELETE /api/purchases/{id}`). It also marks the Product as sold at the Shop. Manual "add" in Stock may call it too (stock team's choice). **A Price alone is not a purchase.**
- **Last bought query**, `Store.LastBought(ctx, ingredientID, shopID *int64) (Product, bool)`: if `shopID` is given and any Product of the Ingredient was bought at that Shop, the most recent of those (`bought_on` desc, purchase id desc); otherwise the most recent purchase of any Product of the Ingredient anywhere; otherwise `false` (callers assume exact amounts and no pack remainder). Batch form `LastBoughtMany(ctx, ingredientIDs, shopID) (map[ingredientID]Product, error)` for the planner/Shopping List. HTTP: `GET /api/products/last-bought?ingredient=ID[&shop=ID]` -> Product or `404 not_found`; `GET /api/products/last-bought?ingredients=1,2,3[&shop=ID]` -> `{"<ingredientId>": Product}` (missing ids absent). Product JSON carries `packSize` (Base Unit), `name`, `id`, `ingredientId`: enough for "2 x Mutti 700 g" and planner `Pack`.
- **Estimated cost** (Shopping List) uses `GET /api/products/{id}/prices/latest?shop=` (latest at the Shop, or any Shop when `shop` is omitted or has none).
- **Delete** a Product: `409 in_use` while any registered usage counter reports references (`product.RegisterUsage(name, func(ctx, q, productID) (int, error))`, called from the stock team's init() for Stock Lots) or while a purchase exists; Shop delete cascades barcodes, rules and Prices (UI confirms) and sets `purchases.shop_id` NULL.
- **Pack size** is in the Ingredient's Base Unit, > 0, finite. Base Unit of an Ingredient cannot change while Products reference it (T2 enforces via our mover `Count`).
- Names: trimmed, internal whitespace collapsed, 1-100 runes. Shop names are unique ignoring case and spacing (`units.NormalizeName`), `409 name_taken`. Product names are not unique.
- Dates `YYYY-MM-DD` validated by parsing; money integer minor units; created_at from the injected clock.
- Events: writes publish topic `products` `{"changed":"shops|products|prices|purchases"}` (SPA invalidates `['shops']`, `['products']`, `['catalog']`).

## Data (migration `internal/db/migrations/0400_products_shops.sql`)
```
shops(id, name, name_key UNIQUE, created_at)
products(id, name, ingredient_id -> ingredients ON DELETE RESTRICT, pack_size REAL CHECK > 0, created_at, updated_at)
product_barcodes(code PRIMARY KEY, product_id -> products ON DELETE CASCADE)      -- global
product_shops(product_id -> products CASCADE, shop_id -> shops CASCADE, PRIMARY KEY(product_id, shop_id))
weight_barcode_rules(id, shop_id -> shops CASCADE, prefix, item_start, item_length, value_start, value_length,
                     value_kind CHECK weight|price, value_unit NOT NULL DEFAULT '', decimal_places, UNIQUE(shop_id, prefix))
shop_barcodes(id, shop_id -> shops CASCADE, product_id -> products CASCADE,
              code TEXT NULL, rule_id -> weight_barcode_rules CASCADE NULL, item_code TEXT NULL,
              CHECK ((code IS NOT NULL AND rule_id IS NULL AND item_code IS NULL) OR (code IS NULL AND rule_id IS NOT NULL AND item_code IS NOT NULL)),
              UNIQUE(shop_id, code), UNIQUE(rule_id, item_code))
prices(id, product_id CASCADE, shop_id CASCADE, date TEXT, price_cents INTEGER NULL CHECK > 0, price_per_kg_cents INTEGER NULL CHECK > 0,
       CHECK (price_cents IS NOT NULL OR price_per_kg_cents IS NOT NULL), UNIQUE(product_id, shop_id, date))
purchases(id, product_id -> products CASCADE, shop_id -> shops SET NULL NULL, bought_on TEXT, created_at)
```
Indexes on `products(ingredient_id)`, `purchases(product_id, bought_on)`, `prices(shop_id, product_id, date)`.

## API (JSON camelCase; errors `{"error":{"code","message"}}`)
Shop `{id,name}`. Rule = `barcode.WeightRule` JSON plus `shopId` (`{id,shopId,prefix,item:{start,length},value:{start,length},valueKind,valueUnit?,decimalPlaces}`). ShopBarcode `{id,shopId,productId,code?|ruleId?,itemCode?}`. Price `{id,productId,shopId,date,priceCents|null,pricePerKgCents|null}` where `pricePerKgCents` is the derived value when not explicit (and `pricePerKgDerived:true`). Product `{id,name,ingredientId,ingredientName,baseUnit,packSize}`; detail adds `barcodes:[code]`, `shops:[Shop]`, `shopBarcodes:[ShopBarcode]`, `latestPrices:[Price]` (one per Shop).

| Route | Auth | Result |
|---|---|---|
| `GET /api/shops` | User | Shops by normalised name |
| `POST /api/shops` `{name}` / `PATCH /api/shops/{id}` `{name}` / `DELETE /api/shops/{id}` | Admin | 201/200 Shop; 204; 400 `invalid_shop`; 409 `name_taken`; 404 |
| `GET /api/shops/{id}/weight-rules` | User | Rules by id |
| `POST /api/shops/{id}/weight-rules` / `PUT /api/weight-rules/{id}` / `DELETE /api/weight-rules/{id}` | Admin | Rule; 400 `invalid_rule` (message = `Validate` error); 409 `duplicate_prefix`, `in_use` |
| `GET /api/shops/{id}/barcodes` | User | ShopBarcodes (plain and weighed) |
| `POST /api/shops/{id}/barcodes` `{productId, code}` or `{productId, ruleId, itemCode}` / `DELETE /api/shop-barcodes/{id}` | User | 201 ShopBarcode; 400 `invalid_barcode`, `invalid_item_code`; 404 (shop, product, rule); 409 `barcode_taken` |
| `GET /api/products[?q=&ingredient=&barcode=]` | User | Products by name; `barcode` is canonicalised and matches global barcodes |
| `POST /api/products` `{name, ingredientId, packSize, barcodes?:[raw], shopBarcodes?:[{shopId, code}\|{shopId, ruleId, itemCode}]}` | User | 201 detail, atomic; 400 `invalid_product`, `invalid_barcode`, `unknown_ingredient`; 409 `barcode_taken` |
| `GET /api/products/{id}` / `PATCH` `{name?, packSize?}` / `DELETE` | User | detail; 200; 204; 409 `in_use`. The Ingredient of a Product is fixed (create a new Product) |
| `POST /api/products/{id}/barcodes` `{code}` / `DELETE /api/products/{id}/barcodes/{code}` | User | 201 / 204 |
| `PUT /api/products/{id}/shops/{shopId}` / `DELETE ...` | User | 204 (known to sell / no longer) |
| `GET /api/products/{id}/prices[?shop=]` | User | Prices, newest first |
| `GET /api/products/{id}/prices/latest[?shop=]` | User | Price or `null` (see above) |
| `PUT /api/products/{id}/prices` `{shopId, date, priceCents?, pricePerKgCents?}` / `DELETE /api/prices/{id}` | User | 200 Price; 400 `invalid_price`, `invalid_date`; 204 |
| `POST /api/purchases` `{productId, shopId?, date}` / `DELETE /api/purchases/{id}` | User | 201 `{id}`; 204 |
| `GET /api/products/last-bought?ingredient=&shop=` or `?ingredients=1,2&shop=` | User | see above |
| `GET /api/catalog[?shop=ID]` | User | `barcode.Catalog` JSON (home when `shop` omitted); 404 unknown Shop |
| `GET /api/resolve?barcode=RAW[&format=ean_13...][&shop=ID]` | User | `{resolution: barcode.Resolution, product: Product\|null}` (`product` for outcomes carrying a `productId`) |

Error codes: `ValidationError` fields map to `invalid_product` / `invalid_shop` / `invalid_price`, except field `date` -> `invalid_date`; `ErrInvalidBarcode` -> `invalid_barcode`; `ErrInvalidItemCode` -> `invalid_item_code`; `ErrUnknownIngredient` -> 400 `unknown_ingredient`; `ErrNotFound` -> 404 `not_found` (also for a Shop, Product or rule id inside a body, or a rule that belongs to another Shop). List endpoints return `[]`, never `null`; an absent optional map in the Catalog is omitted.

Route clash: `GET /api/products/last-bought` is a literal and wins over `/api/products/{id}`.

## Go signatures (tests rely on these)
```go
// internal/product (pure)
type Input struct{ Name string; IngredientID int64; PackSize float64 }
func (in Input) Validate() error                         // *ValidationError{Field}; errors.Is(err, ErrInvalid)
func NormalizeName(s string) string                      // trim + collapse spaces
func ValidateShopName(s string) error
func NormalizeBarcode(raw string) (string, error)        // barcode.Canonical; ErrInvalidBarcode
func ValidateItemCode(rule barcode.WeightRule, item string) error // ErrInvalidItemCode: digits, len == rule.Item.Length
type Price struct{ ID, ProductID, ShopID int64; Date string; PriceCents, PricePerKgCents *int }
type PriceInput struct{ ShopID int64; Date string; PriceCents, PricePerKgCents *int }
func (p PriceInput) Validate() error                     // ErrInvalid / invalid date
func PricePerKg(p Price, packSize float64, base units.Base) (cents int, derived bool, ok bool)
func LatestPrice(prices []Price) (Price, bool)
type ShopBarcode struct{ ID, ShopID, ProductID int64; Code string; RuleID int64; ItemCode string }
type ProductInfo struct{ PackSize float64; Base units.Base }
type CatalogRows struct{ Rules []barcode.WeightRule; ShopBarcodes []ShopBarcode; Global map[string]int64; Latest map[int64]Price; Info map[int64]ProductInfo }
func BuildCatalog(r CatalogRows) barcode.Catalog

// internal/product/store
func New(d *sql.DB, clk clock.Clock) *Store
// Shops: CreateShop, RenameShop, DeleteShop, Shop, Shops
// Rules: CreateRule(ctx, shopID, barcode.WeightRule), UpdateRule(ctx, id, barcode.WeightRule), DeleteRule, Rules(ctx, shopID)
// Products: CreateProduct(ctx, NewProduct) (Detail, error), Product, Products(ctx, Filter), UpdateProduct, DeleteProduct, AddBarcode, RemoveBarcode, SetSoldAt, UnsetSoldAt
// Shop Barcodes: AddShopBarcode(ctx, shopID, productID, code), AddWeighedShopBarcode(ctx, shopID, productID, ruleID, itemCode), ShopBarcodes(ctx, shopID), DeleteShopBarcode
// Prices: RecordPrice(ctx, productID, product.PriceInput) (product.Price, error), Prices(ctx, productID, shopID *int64), LatestPrice(ctx, productID, shopID *int64) (product.Price, bool, error), DeletePrice
// Purchases: RecordPurchase(ctx, productID int64, shopID *int64, date string) (int64, error), DeletePurchase, LastBought, LastBoughtMany
// Catalog(ctx, shopID *int64) (barcode.Catalog, error); Resolve(ctx, raw string, format barcode.Format, shopID *int64) (Resolved, error)
// errors: ErrNotFound ErrNameTaken ErrInUse ErrDuplicatePrefix ErrUnknownIngredient *BarcodeTakenError (ProductID) ; product.ErrInvalid*
func RegisterUsage(name string, f UsageCounter)
```

## Frontend
Two features, composed from `ui/` (Tile, BentoGrid, Chip, BottomSheet, Button, EmptyState, Stepper, useToast); no markup copied.

`web/src/features/shops/` (routes `/settings/shops`, `/settings/shops/:id`; menu nav item "Shops", order 40): shop list tiles (Admin sees add/rename/delete), Shop page with tiles for Shop Barcodes (list, add via Product picker, delete), Weight Barcode Rules (list + editor in a BottomSheet) and Prices known at that Shop. **Weight Barcode Rule editor** shows a live decode preview: a sample 13-digit barcode field decoded with `scan/lib/barcode` and the rule currently being edited (item code, weight in g and the entered unit, or price). Money formatted with the household Currency.
- `index.ts` also exports `ShopsSettingsLink` (a Tile linking to `/settings/shops`): **integration point for T1's SettingsPage** (Admin sees it as "Shops"; it renders only; T1 or the PM adds one line).
- `lib/ruleForm.ts` (form strings <-> `WeightRule`, per-field errors via `validateRule`, unit options per kind), `lib/rulePreview.ts` (`decodeSample`), `hooks/{useShops,useShop,useWeightRules,useShopBarcodes,useRulePreview}.ts`, `components/{ShopList,ShopEditor,WeightRuleList,WeightRuleEditor,RulePreview,ShopBarcodeList,AddShopBarcodeSheet}.tsx`, `screens/{ShopsScreen,ShopScreen}.tsx`, `api.ts`, `types.ts`, `strings.ts`.

`web/src/features/products/` (routes `/products`, `/products/:id`; menu item "Products", order 35): Products list with search; Product page with tiles for pack size, global barcodes, Shops that sell it, Shop Barcodes, Prices (latest per Shop, price per kg, add/edit Price, history).
- `index.ts` also exports `IngredientProducts` (props `{ingredientId, ingredientName, baseUnit}`): a Tile listing the Ingredient's Products with "New Product" (BottomSheet form). **Integration point for T2's `IngredientScreen`**: render `<IngredientProducts ingredientId={id} ingredientName={ingredient.name} baseUnit={ingredient.baseUnit}/>`. The "unknown barcode" sheet (scan team) uses `productsApi.create` and `lib/names.defaultProductName`.
- `lib/money.ts` (`fractionDigits`, `formatMinor`, `parseMajor`, `formatPricePerKg`), `lib/names.ts` (`defaultProductName`, `formatPackSize`), `lib/productForm.ts` (`validateProductForm`, `toNewProduct`), `lib/priceForm.ts` (`validatePriceForm`, `toPriceBody`, `prefillPrice`), `hooks/{useProducts,useProduct,useIngredientProducts,usePrices,useCurrency}.ts`, `components/{ProductList,ProductForm,ProductBarcodes,ProductShops,PriceList,PriceEditor,IngredientProducts}.tsx`, `screens/{ProductsScreen,ProductScreen}.tsx`, `api.ts` (also `catalog(shopId?)`, `resolve`, `lastBought`, `recordPurchase`, `deletePurchase`), `types.ts`, `strings.ts`.
- `useCurrency` reads `/api/household/settings` (T1) `.currency` (default `USD`), key `['household','settings']`.

## Integration notes for other teams
- **Scan team**: build the offline cache from `GET /api/catalog?shop=` (and home), resolve on the phone with `scan/lib/barcode.resolve`; online fallback `GET /api/resolve`. Unknown barcode sheet -> `POST /api/products` (with `barcodes` for global or `shopBarcodes` for Shop-only/weighed). On a resolved scan: `POST /api/purchases` + `PUT /api/products/{id}/prices`. If creating hits `409 barcode_taken` (someone synced first), look the owner up with `GET /api/products?barcode=` and merge into it, with a notice.
- **Planner / Shopping List**: `LastBought` / `LastBoughtMany` (Go, in-process) or `GET /api/products/last-bought`. No purchase = exact amounts and no remainder.
- **Stock team**: call `RecordPurchase` when a Lot is added by scan; `product.RegisterUsage("stock lots", ...)` so Products in use cannot be deleted.
- **T2 (ingredients)**: the Developer adds `store/mover.go` (name `"products"`, `Count` = products with that ingredient, `Move` = `UPDATE products SET ingredient_id=? WHERE ingredient_id=?`; pack sizes are in the same Base Unit because T2 blocks merges with different Base Units). The Ingredient page embeds `IngredientProducts`.
- **T1**: `SettingsPage` embeds `ShopsSettingsLink`.

## Tests (written first)
Go: `internal/product/{product,price,catalog}_test.go`, `internal/product/store/store_test.go`. BDD: `bdd/features/products-shops/{shops,weight_rules,products,shop_barcodes,prices,catalog_resolve,last_bought}.feature`, steps `bdd/steps_products_shops_test.go` (`RegisterSteps("products-shops")`, step text about Shops/Products/Prices). Vitest: lib tests (`money`, `names`, `productForm`, `priceForm`, `ruleForm`, `rulePreview`), component tests (`WeightRuleEditor`, `IngredientProducts`, `PriceEditor`).

## Reviewer follow-ups (tests the Developer must turn green)
- Go: `TestLatestExplicitPricePerKg`, `TestBuildCatalog*` (internal/product/catalog_test.go; migrate `rows()` from `Latest` to `Prices` and drop `Latest`/`Info`), store `TestCatalogPackOnlyPriceNeverMasksAnExplicitPricePerKg`, two BDD scenarios in catalog_resolve.feature.
- SPA: `useProductsLiveUpdates` (new hook, stubbed; a `products` event, any `changed`, and reconnect invalidate `['shops']`, `['products']`, `['catalog']`; mount it from the Products and Shops screens). `useCurrency` goes through T1's `settingsApi.getSettings` under `settingsKeys.settings`. `previewText(p, currency, weightUnit?)` shows the weight in the rule's unit then grams, e.g. "0.5 kg (500 g)" (value rounded to 3 decimals, trailing zeros dropped; plain "750 g" for grams); pass the rule's `valueUnit` from `RulePreview.tsx`.
