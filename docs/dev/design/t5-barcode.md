# T5 barcode: design note

Scope: pure barcode logic, implemented twice so the server and the offline phone resolve scans identically (functional spec §5 Barcode resolution, §10.1, §10.3, §10.4, §15 items 3 and 9). No endpoints, tables or UI here; scan sheets, the scanner hook and the Shop/Product stores belong to other teams and consume these modules.

## Files
- `internal/barcode/barcode.go` (Go, stdlib only): types and functions below.
- `web/src/features/scan/lib/barcode.ts` (plain TS, no React): the same API in camelCase (`parse`, `canonical`, `validateRule`, `weightProductKey`, `resolve`, `weightFromPrice`, `pricePerKgFromWeight`).
- `internal/barcode/testdata/vectors.json`: the shared vectors. `barcode_test.go` and `barcode.test.ts` both run all of them (`normalise`, `rules`, `resolve` against named `catalogs`, `price`). A change in semantics means a change in the vectors and in both implementations. The TS test imports the JSON via a relative path (`resolveJsonModule`, default under `moduleResolution: bundler`); if vite complains about a file outside `web/`, allow the repo root in `server.fs.allow`.

## Parsing (`Parse(raw, format) -> Scanned`)
`Scanned{kind, code, ean13, reason}`. Format names are the `BarcodeDetector` ones (`ean_13 ean_8 upc_a upc_e code_128 qr_code data_matrix`); empty means unknown (typed by hand).
- Input is trimmed; empty is `invalid/empty`.
- **GTIN kinds** (`ean_13`, `ean_8`, `upc_a`, `upc_e`): digits only (`invalid/format`), exact length 13/8/12/8 (`invalid/length`), mod-10 check digit (`invalid/check_digit`). **Canonical code = GTIN-14** (zero padded), so a UPC-A read as EAN-13 with a leading 0 is the same code. `ean13` is the 13-digit form (code minus its leading 0, present only when the code starts with 0); Weight Barcode Rules read it.
- **UPC-E**: first digit must be 0 or 1 (`invalid/format`); expanded to UPC-A by the standard rule on the last of the six digits (0-2, 3, 4, 5-9); the UPC-E check digit must equal the expansion's.
- **Unknown format**: URL -> as QR; non-digits -> opaque; 12/13/14 digits -> GTIN (check digit enforced); 8 digits -> EAN-8 if its check digit is valid, else UPC-E if valid, else `invalid/check_digit`; any other digit run -> opaque. (An 8-digit code valid as both is read as EAN-8; scanners give a format, so this only affects hand-typed codes.)
- **Code 128**: opaque, trimmed, never reinterpreted as a GTIN.
- **QR / DataMatrix**: only an `http(s)` URL is read, and only its **path** (query and `#fragment` are ignored; a trailing slash is fine). The path is split on `/` and **each segment is percent-decoded** (a malformed escape such as `%ZZ` makes the content `not_product`). The first segment equal to `01` that is followed by a segment of 8, 12, 13 or 14 digits is the GS1 Digital Link GTIN, zero padded to GTIN-14 (check digit enforced, `invalid/check_digit`). `01` may follow any path prefix (`/brand/products/01/...`). A key of any other length or with non-digits, and any other content (including bare digits), is `not_product` (the "not a product code" toast). GS1 element strings without a URL (`010950...`) are out of v1 scope. Formats outside the seven are `not_product`.
- `Canonical(raw)` = `Parse(raw, "")`, accepting gtin or opaque; used when a user types a barcode into a Product or Shop Barcode form. **All stored barcodes (global and Shop) are in canonical form.**

## Weight Barcode Rule
Fields: `id, prefix, item{start,length}, value{start,length}, valueKind weight|price, valueUnit, decimalPlaces`. Positions are **1-based** in the 13-digit string (the EAN-13 form of the scan). `Validate` rejects: non-digit/empty prefix, unknown kind, spans with length < 1, either span starting inside the prefix, or ending beyond digit 12 (13 is the check digit), overlapping spans, `decimalPlaces` outside 0..value length, a weight rule whose `valueUnit` is not `g|kg|oz|lb` (omitted = `g`), a price rule with any `valueUnit` (a price is always in the household currency's minor unit: cents by default, USD by default; the currency is a household setting and not this package's concern).

The decoded value is `digits / 10^decimalPlaces` **in the rule's unit**: `0500` with 1 place and unit g is 50.0 g; with 3 places and unit kg it is 0.5 kg = 500 g. To grams: kg x 1000, oz x 28.349523125, lb x 453.59237. `weightGrams` is rounded to the mg (3 decimals) so Go and TS agree; prices are rounded to the minor unit (half up). Internally weights are grams and prices per weight are cents per kg (`pricePerKgCents`) whatever the rule's unit; imperial display is a UI-only conversion.

## Resolution (`Resolve(scanned, catalog) -> Resolution`)
`Catalog` is exactly what the phone caches for one Shop (or for home): `shopBarcodes` (that Shop's), `weightRules` (that Shop's), `weightProducts` (`"<ruleId>:<itemCode>"` -> product id), `pricePerKgCents` (product id -> last price per kg at that Shop), `globalBarcodes`. At home only `globalBarcodes` is filled. The Shop/Product team builds it from the DB: a Shop Barcode row with a rule id goes to `weightProducts`, otherwise to `shopBarcodes`.

Order: not_product / invalid pass through; Shop Barcode (any kind of code, so Code 128 shop labels work) -> Weight Barcode Rules -> global -> unknown. Details:
- Rules apply to scans that have `ean13`, i.e. whose GTIN-14 starts with 0. A GTIN-14 with a non-zero indicator digit (e.g. `10012345678902`) has no `ean13` and always skips the rules. Rules are tried longest prefix first (stable).
- **Zero value**: the longest matching rule whose value is zero stops with `invalid/zero_value`. A zero value on a *shorter* rule, reached only because a longer rule matched but its Product was unknown, is **skipped**: that shorter rule is not a candidate, the longer rule's `unknown_weighed_product` (remembered) stands (a global barcode still wins). Example: rules `290` (item 4-8, value 9-12) and `29` (value 3-7, item 8-12), scan `2900000507500`: rule 290 reads item `00005`, 750 g, Product unknown; rule 29 reads a value of 0; result `unknown_weighed_product` (rule 290, item `00005`, 750 g), not `invalid`.
- Rule matched and Product known (item code found in `weightProducts`): `weighed` (weight-valued: `weightGrams`; price-valued with a price per kg greater than 0: `weightGrams = round(price / ppk * 1000)`, with `priceCents` and `pricePerKgCents`) or `ask_weight` (price-valued, no price per kg or a price per kg of 0; carries `productId`, `priceCents`).
- Rule matched but Product unknown, no other matching rule knows it: remember it, still try global; a global hit wins, otherwise **`unknown_weighed_product`** (ruleId, itemCode, weightGrams or priceCents). The unknown-barcode form then asks only Ingredient and Product name, and the caller stores a Shop Barcode with that rule id and item code.
- Nothing matched: `unknown` with the canonical code (the full form: Ingredient, pack size, name, global vs Shop-only).
- `via` is `shop_barcode | weight_rule | global`.
- **Rounding**: `WeightFromPrice` and `PricePerKgFromWeight` round **half up** in both languages (1 cent at 2000/kg is exactly 0.5 g, so 1 g; 3 cents over 400 g is exactly 7.5, so 8 cents/kg). Prices decoded from rule digits round half up too.
- Helpers: `WeightFromPrice(price, ppk)` and `PricePerKgFromWeight(price, grams)` (rounded; `ok=false` for non-positive input). After `ask_weight` the user gives a weight once; the caller records `PricePerKgFromWeight` as the price per kg for next time.

## US variable-weight UPC-A
USD is the default currency and US weighed goods are UPC-A with number system 2 (`2 IIIII VVVVV c`, 12 digits). **Rules address them in the 13-digit EAN form**: the UPC-A is read as EAN-13 with a leading 0, so the rule prefix is `02` and every position is shifted by one from the printed 12-digit label. Example: label `212345001509` (UPC-A) is `0212345001509`; rule `prefix 02, item 3-7, value 8-12, weight, 2 decimals, lb` gives item code `12345` and value `00150` = 1.50 lb = 680.389 g. Whether the scanner reports `upc_a` or `ean_13` makes no difference (canonical code `00212345001509`). The same rule shape as the European `21`/`22` rules applies; only the prefix differs.

## Language
`weightProducts` (key `"<ruleId>:<itemCode>"` -> product id, built with `WeightProductKey`) and the `unknown_weighed_product` outcome use the glossary word Product. "item code" survives only as the name of the digit span, the spec's own phrase.

## Decisions taken
- Product ids are numbers; offline-created Products pending sync are the scan-hook team's concern.
- A global barcode may be an opaque code too (the unknown form offers global vs Shop-only for any code).
- Check-digit failures are `invalid` (toast "couldn't read, try again"), never silently "unknown".

## Resolved questions
1. Weight Barcode Rule values: each rule configures its value unit (see above). Answered by the product owner.
