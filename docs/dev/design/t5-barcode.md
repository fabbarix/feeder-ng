# T5 barcode: design note

Scope: pure barcode logic, implemented twice so the server and the offline phone resolve scans identically (functional spec §5 Barcode resolution, §10.1, §10.3, §10.4, §15 items 3 and 9). No endpoints, tables or UI here; scan sheets, the scanner hook and the Shop/Product stores belong to other teams and consume these modules.

## Files
- `internal/barcode/barcode.go` (Go, stdlib only): types and functions below.
- `web/src/features/scan/lib/barcode.ts` (plain TS, no React): the same API in camelCase (`parse`, `canonical`, `validateRule`, `weightItemKey`, `resolve`, `weightFromPrice`, `pricePerKgFromWeight`).
- `internal/barcode/testdata/vectors.json`: the shared vectors. `barcode_test.go` and `barcode.test.ts` both run all of them (`normalise`, `rules`, `resolve` against named `catalogs`, `price`). A change in semantics means a change in the vectors and in both implementations. The TS test imports the JSON via a relative path (`resolveJsonModule`, default under `moduleResolution: bundler`); if vite complains about a file outside `web/`, allow the repo root in `server.fs.allow`.

## Parsing (`Parse(raw, format) -> Scanned`)
`Scanned{kind, code, ean13, reason}`. Format names are the `BarcodeDetector` ones (`ean_13 ean_8 upc_a upc_e code_128 qr_code data_matrix`); empty means unknown (typed by hand).
- Input is trimmed; empty is `invalid/empty`.
- **GTIN kinds** (`ean_13`, `ean_8`, `upc_a`, `upc_e`): digits only (`invalid/format`), exact length 13/8/12/8 (`invalid/length`), mod-10 check digit (`invalid/check_digit`). **Canonical code = GTIN-14** (zero padded), so a UPC-A read as EAN-13 with a leading 0 is the same code. `ean13` is the 13-digit form (code minus its leading 0, present only when the code starts with 0); Weight Barcode Rules read it.
- **UPC-E**: first digit must be 0 or 1 (`invalid/format`); expanded to UPC-A by the standard rule on the last of the six digits (0-2, 3, 4, 5-9); the UPC-E check digit must equal the expansion's.
- **Unknown format**: URL -> as QR; non-digits -> opaque; 12/13/14 digits -> GTIN (check digit enforced); 8 digits -> EAN-8 if its check digit is valid, else UPC-E if valid, else `invalid/check_digit`; any other digit run -> opaque. (An 8-digit code valid as both is read as EAN-8; scanners give a format, so this only affects hand-typed codes.)
- **Code 128**: opaque, trimmed, never reinterpreted as a GTIN.
- **QR / DataMatrix**: only an `http(s)` URL whose path has a segment `01` followed by a 14-digit segment is a GS1 Digital Link; that is the GTIN (check digit enforced). Any other content (including bare digits) is `not_product` (the "not a product code" toast). GS1 element strings without a URL (`010950...`) are out of v1 scope. Formats outside the seven are `not_product`.
- `Canonical(raw)` = `Parse(raw, "")`, accepting gtin or opaque; used when a user types a barcode into a Product or Shop Barcode form. **All stored barcodes (global and Shop) are in canonical form.**

## Weight Barcode Rule
Fields: `id, prefix, item{start,length}, value{start,length}, valueKind weight|price, decimalPlaces`. Positions are **1-based** in the 13-digit string. `Validate` rejects: non-digit/empty prefix, unknown kind, spans with length < 1, starting inside the prefix, or ending beyond digit 12 (13 is the check digit), overlapping spans, `decimalPlaces` outside 0..value length. The value is `digits / 10^decimalPlaces`, in **grams** (weight) or **cents** (price) as in the spec (price rounded to a cent).

## Resolution (`Resolve(scanned, catalog) -> Resolution`)
`Catalog` is exactly what the phone caches for one Shop (or for home): `shopBarcodes` (that Shop's), `weightRules` (that Shop's), `weightItems` (`"<ruleId>:<itemCode>"` -> product id), `pricePerKgCents` (product id -> last price per kg at that Shop), `globalBarcodes`. At home only `globalBarcodes` is filled. The Shop/Product team builds it from the DB: a Shop Barcode row with a rule id goes to `weightItems`, otherwise to `shopBarcodes`.

Order: not_product / invalid pass through; Shop Barcode (any kind of code, so Code 128 shop labels work) -> Weight Barcode Rules -> global -> unknown. Details:
- Rules apply to scans that have `ean13`. Rules are tried longest prefix first (stable). A matching rule with a value of zero stops with `invalid/zero_value`.
- Rule matched and item known: `weighed` (weight-valued: `weightGrams`; price-valued with a price per kg: `weightGrams = round(price / ppk * 1000)`, with `priceCents` and `pricePerKgCents`) or `ask_weight` (price-valued, no price per kg; carries `productId`, `priceCents`).
- Rule matched but item unknown, no longer-or-shorter rule knows it: remember it, still try global; a global hit wins, otherwise **`unknown_weighed_item`** (ruleId, itemCode, weightGrams or priceCents). The unknown-barcode form then asks only Ingredient and Product name, and the caller stores a Shop Barcode with that rule id and item code.
- Nothing matched: `unknown` with the canonical code (the full form: Ingredient, pack size, name, global vs Shop-only).
- `via` is `shop_barcode | weight_rule | global`.
- Helpers: `WeightFromPrice(price, ppk)` and `PricePerKgFromWeight(price, grams)` (rounded; `ok=false` for non-positive input). After `ask_weight` the user gives a weight once; the caller records `PricePerKgFromWeight` as the price per kg for next time.

## Decisions taken
- Product ids are numbers; offline-created Products pending sync are the scan-hook team's concern.
- A global barcode may be an opaque code too (the unknown form offers global vs Shop-only for any code).
- Check-digit failures are `invalid` (toast "couldn't read, try again"), never silently "unknown".

## QUESTIONS (for the product owner; defaults above)
1. "Value kind weight (g) or price (cents), with decimal places": I read decimal places as dividing the value digits (e.g. `0500` with 1 place = 50.0 g). If instead the digits are kg or euros with N decimals, say so and the vectors change.
