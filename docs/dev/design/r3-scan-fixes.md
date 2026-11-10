# R3 scan fixes (QA round 2): B4 logic, B5, B6, B7

Scope: `internal/scan`, `internal/product` (one additive helper), `web/src/features/scan`. Builds on t13-shopping-scan, t5-barcode, t9-products-shops.

## B5: a weighed barcode is priced by weight
Rule: for a weight-decoded scan, Price = decoded grams x price per kg / 1000, rounded half up to the minor unit. Rule 21, Product 1 kg at $8.99: 2112345008509 (850 g) = 764, 2112345004501 (450 g) = 405 (404.55). A price-valued barcode keeps its decoded price. Cause: the phone sent no price for weight-valued codes (no explicit price per kg is cached), so the server fell back to the pack Price.

- `scan.Op.Weighed bool` (`weighed`): a `shop_scan` whose Quantity is a decoded weight. Validation: only on `shop_scan` (field `weighed` otherwise).
- `product.PriceForWeight(p Price, packSize, base, grams) (cents, ok)`: explicit price per kg x grams/1000; else, for units.Gram with packSize > 0, PriceCents x grams / packSize (one rounding, none on an intermediate price per kg); half up; ok=false with no basis, grams <= 0 or a result below 1.
- Service `purchase`, when `op.Weighed` and `PriceCents == nil`: per kg = `op.PricePerKgCents` else the latest Price at the Shop (via `PriceForWeight`; the service builds a `product.Price` from `PriceInfo`, using `ProductInfo.PackSize/BaseUnit`). Price = that result; the recorded Price is PriceCents + the price per kg used (explicit or derived), so the next scan and the Catalog agree. No basis: nothing recorded (as today). A `PriceCents` on the op always wins (price-valued code, or an offline edit). Pack scans are untouched.
- Client `planScan` (known/weighed): `weighed: true`; price per kg = catalog explicit, else derived from the Product's lastPriceCents and packSize (g only); price = decoded price (price rule) else `round half up (perKg x grams / 1000)` (derived: pack price x grams / packSize), else null. The flow sends `weighed: true`, `priceCents`, `pricePerKgCents` when known.

## B6: offline price shown and editable
The toast already carries the prefilled price once planScan computes it (B5). `canEditPrice` is now true while the scan is queued. Editing a queued scan changes the queued Op: `OfflineQueue.updatePrice(uuid, cents): Promise<boolean>` (inside the queue lock; false once the Op left the queue), exposed as `useSyncQueue().updateQueuedPrice`, injected into the flow as `deps.setQueuedPrice?`. `editPrice`: if the line is queued and `setQueuedPrice` answers true, only the line changes; otherwise `deps.setPrice` (server).

## B7: the line follows the sync
`ScanFlow.applySyncResults(results)`; the controller calls it from `useSyncQueue.onResults`. For the line's clientUuid: `applied`/`duplicate` set `queued=false` and take the server's quantity/price/onList (the "Waiting to sync" label goes; Undo and edit then go to the server); `rejected` clears the line (the sync notices already explain it).

## B4 logic: camera failure recovery
- `useCamera`: statuses add `no_camera` (NotFoundError, DevicesNotFoundError) and `in_use` (NotReadableError, TrackStartError); `denied` (NotAllowedError, SecurityError), `unsupported`, `error` as before; `retry()` restarts the request (only from a failed status while enabled).
- `lib/cameraFailure.ts`: `cameraFailure(status) -> {status, canRetry, message} | null`; `canRetry` false only for `unsupported`.
- `lib/manualBarcode.ts`: `validateManualBarcode(raw) -> {ok, scanned} | {ok:false, reason: empty|length|format|check_digit}`. Strips spaces and hyphens, then `barcode.parse(s, '')`: gtin -> ok; invalid -> its reason; opaque/not_product -> `length` if all digits, else `format`.
- `hooks/useCameraRecovery({status, retryCamera, onScan})`: `failure`, `manualOpen/openManual/closeManual`, `text/setText`, `error`, `submit()` (valid: `onScan(scanned)` once, clears text and error, true), `retry()` (clears error; calls `retryCamera` only when `canRetry`). `setText` clears the error. Exposed on `ScanController.recovery`.
- `components/CameraFailure`: minimal markup from `ui/Button` and the existing `field` classes (text input, `inputMode="numeric"`, no native number control); the screen team restyles it (ui-fix-plan §5.6, §4). `ScanScreen` renders it where the camera status text was.

## Tests
Go: `product.TestPriceForWeight`, `scan.TestWeighedFlagOnlyOnAShopScan`, service weighed tests; BDD `shopping-scan/weighed_price.feature` (steps send `weighed`). Vitest: manualBarcode, cameraFailure, useCameraRecovery, CameraFailure, useCamera, queue.updatePrice, useSyncQueue, resolveScan, `useScanFlow.offline`, ScanScreen.
