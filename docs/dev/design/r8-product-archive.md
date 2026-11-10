# R8 product archive: design (backend)

Scope: user decision of 2026-11-10 (spec §5 "Archiving Products", §15 entry 21). A bought Product cannot be deleted; it can be **Archived** and **unarchived**. Backend only (migration, `internal/product`, store, httpapi, BDD). GLOSSARY: new term **Archived**, shared with Recipes.

## Decisions
- **Archive, not delete, once bought.** `DELETE /api/products/{id}` on a Product with a purchase or a registered usage (Stock Lots) now answers `409 product_bought` (message says to archive it). `store.ErrBought` wraps `ErrInUse`, so `errors.Is(err, ErrInUse)` still holds. A never-bought Product can be deleted whether archived or not.
- **Soft flag.** `products.archived_at TEXT NULL` (RFC 3339, from the injected clock; NULL = active). Everything else (barcodes, Shop Barcodes, purchases, Prices, sold-at links) stays untouched.
- **Lists and pickers.** `GET /api/products` returns active Products only; `?includeArchived=1` returns both (each Product carries `archived`). It composes with `q`, `ingredient`, `barcode`. No archived-only filter: the catalogue screen filters client-side on `archived`. `GET /api/products/{id}` still works for an archived Product (history screens, unarchive).
- **Scanning.** An archived Product is excluded from `Store.Catalog` (global barcodes, plain Shop Barcodes, weighed Shop Barcodes and its `pricePerKgCents`) so the offline cache never matches it for a new purchase, and from `Store.Resolve`. Its scan is therefore **unknown** (or `unknown_weighed_product` for a rule-matched item code). Justification: spec says archived things are "excluded ... kept for history" (as Recipes, §4); matching it would add stock of a retired pack silently. To avoid a dead end, **online resolve names the owner**: `Resolved.ArchivedProduct` (JSON `archivedProduct`, null otherwise) is set when the unknown result is only because an archived Product owns the code (global, plain Shop Barcode at that Shop, or weighed item of that Shop's rule). The scan UI offers "Unarchive <name>?" first, and "New Product" second. The offline path cannot know (the Catalog omits archived codes), so it falls through to the create sheet, which then hits the barcode rule below and offers the same unarchive.
- **Barcode uniqueness.** An archived Product still owns its barcodes. Creating a Product, `POST /api/products/{id}/barcodes` or a Shop Barcode that collides with an archived owner is refused `409 barcode_archived`; the message keeps the existing form "barcode already belongs to product N" (so clients parse the owner id as for `barcode_taken`). `BarcodeTakenError.Archived` tells the httpapi which code to use. Merging flow (scan team): on `barcode_archived`, call `POST /api/products/N/unarchive`, then use Product N. Finding the owner by barcode needs `GET /api/products?barcode=..&includeArchived=1`.
- **Last bought.** `LastBought`/`LastBoughtMany` and `GET /api/products/last-bought` skip archived Products: at a Shop, the most recent non-archived Product bought there, else the most recent non-archived anywhere, else 404 / absent (exact amounts). Unarchiving restores the suggestion (purchases are untouched).
- **Late writes.** `RecordPurchase`, `RecordPrice`, adding barcodes and PATCH still work on an archived Product: an offline phone may sync a scan made before the archive, and the purchase is true. They do not unarchive.
- **Archive/unarchive** are idempotent, any signed-in User (as Recipes), `404 not_found` for an unknown id. Both publish `products` `{"changed":"products"}`.
- Ingredient merge/delete (`mover`) counts archived Products too (they still reference the Ingredient).

## Data
Migration `1140_product_archive.sql`: `ALTER TABLE products ADD COLUMN archived_at TEXT; CREATE INDEX products_active ON products(archived_at);`

## API
| Route | Auth | Result |
|---|---|---|
| `POST /api/products/{id}/archive` / `.../unarchive` (body ignored) | User | 200 Product detail with `archived`; 404 |
| `GET /api/products[?includeArchived=1&q=&ingredient=&barcode=]` | User | active only unless `includeArchived=1`; Product gains `archived: bool` |
| `DELETE /api/products/{id}` | User | 204; **409 `product_bought`** (was `in_use`) when bought or used |
| create / add barcode / add Shop Barcode | User | **409 `barcode_archived`** when an archived Product owns the code |
| `GET /api/resolve` | User | adds `archivedProduct: Product\|null` |
| `GET /api/catalog`, `GET /api/products/last-bought` | User | omit archived Products |

## Go signatures (tests rely on these)
```go
// store
func (s *Store) SetArchived(ctx, id int64, archived bool) (Detail, error) // idempotent; ErrNotFound
var ErrBought                                   // wraps ErrInUse
type Product struct{ ...; Archived bool `json:"archived"` }
type Filter struct{ ...; IncludeArchived bool }
type BarcodeTakenError struct{ Code string; ProductID int64; Archived bool }
type Resolved struct{ ...; ArchivedProduct *Product `json:"archivedProduct"` }
```
httpapi: `ErrBought` -> `product_bought` must be tested before the generic `ErrInUse` case; `*BarcodeTakenError{Archived}` -> `barcode_archived`.

## Tests (red)
`internal/product/store/archive_test.go`; BDD `bdd/features/products-shops/product_archive.feature` plus the changed delete scenario in `products.feature`; steps `the Product "X" is archived`, `the Products response text contains`. TS: `Product.archived?` optional so existing fixtures compile.

## UI notes for the WP11 catalogue screen team (not built here)
- Product page: **Archive** action (a `ConfirmDialog`, not a native confirm) shown instead of/next to Delete; Delete only when never bought, and on `product_bought` offer Archive. Archived Product page shows an "Archived" Chip and an **Unarchive** action.
- Catalogue list: an "Archived" filter (toggle chip) that requests `?includeArchived=1` and filters on `archived`; archived rows muted. Pickers never request archived.
- Scan sheets: when resolve returns `archivedProduct`, show "Unarchive <name>?" (ConfirmDialog) before the New Product sheet; handle `409 barcode_archived` from create the same way.
- Add `productsApi.archive/unarchive` and `includeArchived` to `ProductFilter`; invalidate `['products']` and `['catalog']`.
