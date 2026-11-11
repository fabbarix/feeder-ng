# PP: Product pictures

IM2 put a **Picture** on Ingredients and a **Photo** on Members through the one `ImagePicker`. PP gives the same to **Products**, in beta.1: the data model and API, the Product page and the Product sheet,
Product rows, and the scan line. Inputs: [im2-image-fields.md](im2-image-fields.md) (the pattern copied here), [ip1-imagepicker.md](ip1-imagepicker.md),
[functional-spec.md](../../spec/functional-spec.md) (§5 Products, §10.1 scanning, §13), [t9-products-shops.md](t9-products-shops.md), [t13-shopping-scan.md](t13-shopping-scan.md).

Pipeline step 1 (this commit): this note, the spec/GLOSSARY edits, **red tests**, and type-only stubs so `go vet` and `typecheck` stay green. No behaviour is implemented.

## Decisions
- **Term: Picture.** GLOSSARY: a Recipe, a Step or a Member has a **Photo**; an Ingredient or a Product has a **Picture** (see **Photo**). `Product` gets "May carry a **Picture**" and `_Avoid_ pack shot, product photo`. UI label everywhere: "Picture". Code: `image` (id) and `imageUrl`, as for Ingredients.
- **Migration `1312_product_image.sql`**: `ALTER TABLE products ADD COLUMN image TEXT NOT NULL DEFAULT ''` (latest in `internal/db/migrations` is `1311_member_photo.sql`; re-check at merge, another team may have taken 1312). An old database upgrades with no data change.
- **`refs.Default` gains `{"products","image"}`.** Without it the nightly sweep deletes the file after 24 h and `Guarded` lets an Ingredient or Member delete a file a Product shows (both are tested).
- **Guarded deletes.** The Product Store is built with `store.WithImages(images.NewGuarded(files, refs.New(db)))` in `internal/product/httpapi` and in `internal/scan/httpapi/wiring.go` (the scan `catalogue` creates Products). `internal/shopping/httpapi/wiring.go` only reads Products and keeps `productstore.New(d.DB, d.Clock)`.
- **ImagePicker aspect 4:3** (`CROP_ASPECTS.landscape`), upload mode, imported from the `ui` barrel (host tests swap in `FakeImagePicker`).
- **Not in a Recipe File** (it holds Recipes and their Ingredients). **Not on Shopping List, Stock or Plan rows** here: that is the later "pictures everywhere" package (PE), which reuses the `Thumb` below.

## Data model and API
- `product.Input.Image` (stub added). `Validate` trims it and accepts `""` or a well-formed id (`imaging.ValidID`), else `*ValidationError{Field: "image"}`; the HTTP layer maps it to `400 invalid_product`. (`Validate` has a value receiver and returns only `error`, so the trimmed id is applied by the Store, as `product.NormalizeName` is: `strings.TrimSpace(in.Image)`.)
- `store.Product` (the summary every reader returns) gains `Image` and `ImageURL` (`json:"image"`, `json:"imageUrl"`, both always sent, `""` when none; `ImageURL = "/api/images/"+Image`). They ride on `productSelect`/`scanProduct`, so the **list, detail, Resolve (`/api/resolve`, `archivedProduct` too), last-bought and `Catalog` consumers** all carry the picture with no further change.
- `store.New(db, clk, opts ...Option)`; `store.Images` (`Exists`, `Delete`, the same two methods as `ingredient/store.Images`), `store.WithImages` (stubs added).
  - `CreateProduct` / `SetImage` refuse an id that was never uploaded: `*product.ValidationError{Field: "image"}`, nothing written. Without `WithImages`, ids are not checked and files are not deleted.
  - **`SetImage(ctx, id, image) (Detail, error)`** (stub added) is the one write path for the picture: `""` clears, an id sets or replaces; `ErrNotFound` for an unknown Product. It is a method of its own, not a new `UpdateProduct` parameter, so the existing callers and tests of `UpdateProduct(id, name, packSize)` do not change. The HTTP `PATCH` runs `UpdateProduct` when `name` or `packSize` is present, then `SetImage` when `image` is present (two statements, not one transaction; a failed second leaves the first applied, same as the Ingredient page's separate saves, and the SPA only ever sends one field per PATCH).
  - After a replace, a clear, or `DeleteProduct`, `dropUnreferenced(old)` deletes the old file **only if no Product row still has it** (`SELECT COUNT(*) FROM products WHERE image = ?`), best effort; `Guarded` then also checks every other column in `refs.Default`. Saving the same id again deletes nothing. A refused delete (`ErrBought`) deletes nothing. **Archive/unarchive keep the file.**
- `internal/product/httpapi`: mounts `imaging.NewStore(<data>/images)` like the Ingredient module. `POST /api/products` takes `image`; `PATCH /api/products/{id}` takes `image` presence-aware (`productPatch.Image *string`: absent keeps, `""` removes, id sets). `writeErr` already maps a `product.ValidationError` to `400 invalid_product`. A live-update `changed("products")` is published as today.
- **Scan.**
  - `scan.Op.ProductImage` (`productImage`): only on `shop_unknown`; `Validate` refuses a malformed id on any kind, and any value on `shop_scan`/`stock_take`, with `ValidationError{Field: "productImage"}`. `service.NewProduct.Image` carries it to `catalogue.CreateProduct` (`product.Input.Image`). A never-uploaded id makes `CreateProduct` fail with a `product.ValidationError`, which the existing mapping turns into a rejected result `validation_failed` (HTTP 422); nothing is created.
  - If the barcode was created meanwhile by someone else (`BarcodeTakenError`), the op merges into the existing Product, **the form's picture is ignored and the existing Product keeps its own**. The uploaded file is left unreferenced and the nightly sweep removes it.
  - `scan.Applied.ProductImageURL` (`productImageUrl`, `omitempty`) comes from `ProductInfo.ImageURL` (stub added; `productInfo()` in `wiring.go` fills it from `store.Product.ImageURL`), on every kind of scan including merged and stock-take.
  - `service.OfflineProduct.ImageURL` (`imageUrl`, `omitempty`) so a phone describes a **queued** scan with the thumbnail. The cache size cost is one short string per pictured Product.

## Frontend

### Shared thumb: **primitive request (do not edit `ui/` here)**
There is no generic thumb in `web/src/ui`. `RecipeThumb` is the only one: it draws the photo or a *generated Recipe tile* (tag icon and initial), which is wrong for a pack. The Ingredient list (IM2) works around it with `RecipeThumb name="" photoUrl size={40}` plus a feature-local `.ingredient-row__no-picture` span so rows line up. Copying that into Products and the scan line would copy markup between screens. Request:

> **`ui/Thumb`** `{ imageUrl?: string; size?: 40 | 48 | 72 | 'hero'; label?: string }` (+ `Thumb.css`, exported from `ui/index.ts` with `ThumbProps`).
> - With `imageUrl`: `<span class="thumb" data-size={size}><img src alt={label ?? ''} onError=…/></span>`, `object-fit: cover`, rounded like `RecipeThumb`. Decorative (`alt=""`) unless `label` is given.
> - Without it, or after a load error (the failed address is remembered, a different address retries, as `Avatar` and `RecipeThumb` do): an **empty reserved slot** `<span class="thumb" data-size={size} aria-hidden="true">` of the same box, soft surface fill, no icon, no initial. This is the slot that keeps `ListRow` names aligned.
> - `size` default 40. Same `data-size` attribute the Ingredient list tests already read.
> - Own test `ui/Thumb.test.tsx`: image with `alt=""`; `label` becomes the alt; missing url renders the slot with the same `data-size`; a broken image falls back to the slot; a new url retries.
> - Consumers: `ProductList` (leading), `IngredientList` (replace its local span, delete `.ingredient-row__no-picture`), `ScanFeedback` (leading, only when a url is given), then PE's Shopping List, Stock and Plan rows.

Owner constraint: team R2-1 owns `web/src/ui` until it merges (imminent) and PE comes after PP. **PP's Developer adds `ui/Thumb` as the first commit of the Developer step, after R2-1's merge into main**, with the test above, migrates `IngredientList` in the same commit (its `IngredientList.picture.test.tsx` already pins the markup contract: `.list-row__leading` first child has `data-size="40"`, an `img` with `alt=""` only when there is a picture), and PE then simply consumes it. If R2-1 has not merged by then, the Developer builds the three consumers on `RecipeThumb` + the same slot exactly as `IngredientList` does and swaps to `Thumb` in the follow-up; the tests are written against the DOM contract so they pass either way.

### Products
- `types.ts`: `Product.image?`/`imageUrl?` (optional only so existing fixtures compile; the server always sends them), `NewProduct.image?`. `productsApi.patch` body gains `image?`.
- `ProductList`: `leading={<Thumb imageUrl={p.imageUrl} size={40} />}` on **every** row (empty slot when none), so a list never half-aligns. Row height therefore becomes 72 (`ListRow` with `leading`) for every Product row. The archived chip stays `trailing`.
- `ProductScreen`: a new first Tile, `Tile as="section" span="full" aria-label={strings.pictureLabel}` with `<h2 className="pg__tile-title">` and `<ImagePicker label={strings.pictureLabel} value={product.image ?? ''} onChange={(id) => void attempt(() => p.setImage(id))} aspect={CROP_ASPECTS.landscape} />`, before the Pack size Tile. Not locked by purchases or by archiving. A failure shows in the screen's existing `role="alert"`.
- `useProduct.setImage(id)` -> `productsApi.patch(productId, { image: id })` through the same `changed()` (refreshes the Product, the list and `['catalog']`). Stub added: a no-op.
- `ProductForm` (the Product sheet on the Ingredient page, via `IngredientProducts`): after Barcode and before `FormActions`, `<ImagePicker label={strings.pictureLabel} value={form.values.image ?? ''} onChange={form.setImage} aspect={CROP_ASPECTS.landscape} />`. `useProductForm.setImage`; `toNewProduct` adds `image` **only when non-empty**, so the existing exact-match `create` tests keep passing. `validateProductForm` never validates it. The Developer disables Save while the picker is busy, if the picker exposes that (the same open point as IM2).
- All hosts import `ImagePicker` and `CROP_ASPECTS` from the `ui` barrel. The `image-input` guard (`scripts/check-ui.sh`) already forbids any other image input in a feature.

### Scan
- `types.ts`: `Op.productImage?`, `ScanApplied.productImageUrl?`, `OfflineProduct.imageUrl?`. `UnknownFormValues.image?` (optional so existing literals compile; `emptyForm()` sets `''`). `toUnknownOp` adds `productImage` **only when non-empty**, for pack, weighed and weighed_price alike (every unknown code creates a Product).
- `UnknownBarcodeSheet`: after the Product name field (and the scope cards, before the weight hint and Save) an `ImagePicker label={scanStrings.pictureLabel} aspect landscape listenOn="dialog"` bound to `values.image`. New prop `canUpload?: boolean` (default true): **false hides the field**, because the picker uploads and a form filled in offline is queued. `ScanScreen` passes `canUpload={c.online}`.
- `useScanFlow` (`FlowFeedback.imageUrl?`): from the Result's `scan.productImageUrl` when there is a Result (including the sync Result that takes over a queued line, B7), else from the offline Product's `imageUrl` for a queued scan; absent otherwise. A Result without a picture shows none even if the cache had one (the server is right). The `Line` state and `applySyncResults` carry it.
- `ScanFeedback`: new `imageUrl?`; with it, a leading `<Thumb imageUrl size={40} />` before the text, **outside the live region's text** (decorative), without it nothing is drawn and no slot is kept (one line, not a column). `ScanScreen` passes `imageUrl={fb.imageUrl}`.
- Not included: the `StockTakeSheet`, `AskWeightSheet`, `PriceEditSheet` and `UnarchiveProductSheet` headers (they name the Product in text). PE may add the thumb there.

## Tests (all red unless noted)

Go
- `internal/product/image_test.go`: `Validate` accepts none / an id / a padded id; refuses 5 malformed ids on field `image`. (Accepting cases pass today.)
- `internal/product/store/image_test.go` (fake `Images`): create keeps the picture and `Product`, `Products` and `Resolve` return it with its URL; none by default (green); create refuses a never-uploaded id and writes nothing; `SetImage` sets/replaces/clears and drops the replaced file only; the same id again deletes nothing (green); refuses a ghost id and keeps the old one; unknown Product is `ErrNotFound` (green); rename and archive/unarchive keep it; `DeleteProduct` removes the file; a refused delete (`ErrBought`) keeps it (green); a file another Product still uses is kept (green).
- `internal/product/httpapi/image_test.go` (testkit, real uploads): create with picture; empty `image`/`imageUrl` always present (green); PATCH set / keep / same-again / clear and the cleared file is 404; malformed and never-uploaded are `400 invalid_product` on create and patch; delete removes the file; archive keeps it; **Guarded** both ways (a Product clearing an id an Ingredient still uses, and an Ingredient clearing an id a Product still uses).
- `internal/images/refs/refs_pp_test.go`: `Default` has `products.image`; `ReferencedIDs` and `IsReferenced` see a Product picture.
- `internal/scan/image_test.go`: `productImage` accepted on the unknown forms, malformed refused on field `productImage`, refused on `shop_scan`/`stock_take`; result JSON has `productImageUrl` only when set.
- `internal/scan/httpapi/image_test.go`: a scan of a pictured Product returns its URL; none -> no key (green); the form creates the Product with the picture; a ghost id rejects with 422 `validation_failed` and creates nothing; a merged scan keeps the existing picture; offline data carries `imageUrl`.

BDD (`bdd/features/products-shops/product_pictures.feature`, 12 scenarios, steps in `bdd/steps_pp_test.go`): add a Product with a Picture; none (green); add/replace/remove deleting old files; rename keeps it; never-uploaded refused; in-use discard refused (`image_in_use`); nightly sweep keeps it; archive keeps, delete removes the file; **a scan shows the Product's Picture**; a scan of a Product without one shows none (green); the what-is-this form adds a Picture; the phone's offline data carries it.

Web (vitest)
- `products/screens/ProductScreen.picture.test.tsx` (7): Picture Tile, h2, first, 4:3, current id, PATCH `{image}` on pick, PATCH `{image: ''}` on remove, alert on failure, archived can change it.
- `products/components/ProductForm.picture.test.tsx` (5), `IngredientProducts.picture.test.tsx` (1), `products/lib/productForm.picture.test.ts` (3, two green).
- `products/components/ProductList.picture.test.tsx` (4): thumb `img` `alt=""` 40 px in `.list-row__leading`; same slot and same row height without a picture; archived and `showIngredient={false}` rows; link and meta unchanged (green).
- `scan/components/ScanFeedback.picture.test.tsx` (4), `scan/hooks/useScanFlow.picture.test.tsx` (6, two green), `scan/lib/unknownForm.picture.test.ts` (5, three green), `scan/components/UnknownBarcodeSheet.picture.test.tsx` (7), `scan/screens/ScanScreen.picture.test.tsx` (4, two green).
- Host tests use `ui/ImagePicker/fake.test-helper.tsx`.

**Existing tests I changed:** none. The Product tests that pin an exact `create` body keep passing because `image` is omitted when empty.

### Red list and what stays green
Red now: `go test ./...` has failures only in `internal/product`, `internal/product/store`, `internal/product/httpapi`, `internal/images/refs`, `internal/scan`, `internal/scan/httpapi` and the 10 pictured scenarios of `bdd` (`TestFeatures`); vitest has 30 failing tests, all in the 10 new `*.picture.test.*` files. Everything else is green; the green-by-design cases above pin behaviour that must not regress.

## Order of work for the Developer
1. Migration 1312, `refs.Default`, `product.Input.Validate`, store (`WithImages`, `SetImage`, `scanProduct`/`productSelect`, insert, `dropUnreferenced` on update/delete), Product httpapi (`image` on POST/PATCH, `NewStore`, `Guarded`).
2. Scan: `Op.ProductImage` validation, `service.NewProduct.Image`, `wiring.go` (`WithImages`, `ProductInfo.ImageURL`, `OfflineProduct.ImageURL`), `Applied.ProductImageURL` for every result path.
3. `ui/Thumb` (after R2-1 merges), migrate `IngredientList`.
4. Products web: `ProductList` leading, `useProduct.setImage`, `ProductScreen` Tile, `ProductForm`/`useProductForm`/`toNewProduct`.
5. Scan web: `UnknownBarcodeSheet` field + `canUpload`, `toUnknownOp`, `useScanFlow` image, `ScanFeedback`, `ScanScreen`.
6. `scripts/check.sh`.

## Product questions
1. **Shop pictures?** Not needed; a Shop is a name. Not in PP.
2. **A merged scan** (superseded by [PPX](ppx-product-picture-sync.md): the second picture now fills a Product that has none) (two phones create the same barcode): the second phone's picture is dropped and the first Product keeps its own. Should the second picture fill in when the existing Product has **none**? Easy (`SetImage` when empty); left out to keep a scan from editing a Product.
3. **Offline unknown barcode** (superseded by [PPX](ppx-product-picture-sync.md)) loses the Picture field (it uploads). Alternative: queue the cropped blob in IndexedDB and upload on sync. Out of scope for beta.1.
4. **Row height.** Giving every Product row a leading slot makes the Products list rows 72 instead of 64. Intended, and the same as the Ingredients list.
