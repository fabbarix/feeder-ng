# WP7: Shop + Scan screens (round 2)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 5.5 (Shop), 5.6 (Scan), workflow 2.5, section 4 (primitives), 6 (copy), and CLAUDE.md "No native browser UI".
QA: `qa-report.md` (Shop, Scan, B4, G3, `/api/shopping/list` about 4 fetches per tick). Merged R8 (archived Products). Key acceptance: tick target >= 44 px; no dash;
offline shows the cached list plus a banner; the range is a Select. Owns `web/src/features/shop/**` and `web/src/features/scan/**`.
The WP3/WP4 primitives are used as they are (Select family, fields, Stepper-less NumberField, ListRow, PageHeader, ErrorState, Skeleton, BottomSheet, Toast, IconButton).

## Backend (strictly needed, one place)
`internal/scan/service`: a `shop_unknown` Op whose barcode is owned by an **archived** Product must not be merged into silently (today `wiring.go` turns
`productstore.BarcodeTakenError` into `service.BarcodeTakenError`, i.e. a merge: Stock would be added to a retired pack). New: `BarcodeTakenError.Archived bool`,
`const CodeBarcodeArchived = "barcode_archived"`; the service answers a **rejected** Result `{code: "barcode_archived", message: "barcode already belongs to product N"}`
(the id stays parseable, as R8 says for the HTTP 409). `wiring.go` copies `taken.Archived`. Test: `service_test.go TestABarcodeOwnedByAnArchivedProductIsRejectedNotMerged` (red). No other backend change; the stub only adds the field and constant.

## Frontend: what changes, by file
| File | State | Contract |
|---|---|---|
| `shop/lib/lines.ts` | change | `ListEntry` gains `quantityText` ("1400 g") and `packLine` ("2 × Mutti 700 g"); `estimatedCost` is `null` when unpriced (no dash); `priceText` returns `string \| null`; `detail` stays (the Scan live list uses it) |
| `shop/lib/range.ts` | add | `rangeOptions(today, maxTo)` -> `{value, label}` with `describeRange` labels, max 14 |
| `shop/lib/liveRefresh.ts` | new | `createLiveRefresh(invalidate, windowMs=250)` and `liveRefreshFor(queryClient)` (one per client, invalidates `['shopping']` with `cancelRefetch:false`) |
| `shop/hooks/useShoppingList.ts` | change | SSE and reconnect call `liveRefreshFor(qc).request()`; result gains `status` and `retry` |
| `shop/hooks/useShoppingActions.ts` | change | list refresh through `liveRefreshFor(qc).request()`; `['stock']` still invalidated at once |
| `shop/hooks/useShopChoice.ts` | new (G3) | `useShopChoice(storage?) -> { shops, shopId, setShopId, isLoading }` over `useShops` + `scan/lib/lastShop` (same "last Shop used" as Scan) |
| `shop/components/LineTile.tsx` | change | tile per mockup: quantity 18/800, name 14/700, pack 11 muted, cost (only when priced), tick control 44 px, extras: `extra` icon + compact `IconButton` "Delete <name>" |
| `shop/components/CostTile.tsx` | change | `{estimatedCostCents, unpriced, currency, shopName?, onScan?}`: "$13.50" + "est. at Coop" / "est."; no amount and no "Estimated cost" caption when nothing is priced; "N without a price"; `Button variant="accent-secondary" size="sm"` "Scan" |
| `shop/components/CelebrationTile.tsx` | change | `Tile variant="soft"` with the `celebration` icon; no "$0.00 spent" |
| `shop/components/RangePicker.tsx` | change | one `Select` (label "Shop for", trigger shows "Until Thu 12") over `rangeOptions` |
| `shop/components/TickSheet.tsx` | change | `NumberField` "How much?" (min 0, unit suffix), primary "Tick and add to Stock", secondary "Tick without adding" |
| `shop/components/ExtraSheet.tsx` | change | `TextField` + `IngredientSelect` + `NumberField` (min 0, unit = the Ingredient's Base Unit); `ingredients` carry `baseUnit`; quantity text for `checkExtraDraft` is `String(value ?? '')` |
| `shop/components/ShoppingBody.tsx` | change | hero `ProgressTile` ("Left to get", value = left), `CostTile`, open tiles, Ticked group; no range here |
| `shop/screens/ShoppingScreen.tsx` | change | see "Shop screen" |
| `shop/shop.css` | new | feature CSS, tokens only (the old classes had no CSS at all) |
| `scan/lib/initialChoice.ts` | new | `initialChoice(shops, lastShopId) -> ScanChoice \| null` |
| `scan/lib/stockTakeToast.ts` | new | `stockTakeMessage(action, ingredientName, totalText)` |
| `scan/lib/archivedProduct.ts` | new | `ArchivedProduct` type, `archivedOwnerId(result)` |
| `scan/lib/queueEvents.ts` | new | `onQueueChange`, `emitQueueChange`, `withChangeEvents(store)`; `appOpStore()` returns the wrapped store |
| `scan/hooks/useShellStatus.ts` | new | `useShellStatus(store?) -> { pendingScans }`, exported from `scan/index.ts` |
| `scan/api.ts` | change | `findArchived(barcode, shopId)` (GET `/api/resolve`), `product(id)`, `unarchiveProduct(id)` (POST `/api/products/{id}/unarchive`) |
| `scan/hooks/useScanFlow.ts` | change | deps `notify`, `findArchived`, `fetchProduct`, `unarchive`; sheet kind `unarchive`; methods `unarchiveProduct`, `createNewInstead` |
| `scan/hooks/useScanController.ts` | change | wires `useToast().show` to `notify`, the three archived deps to `scanApi`, refreshes `['products']`, `['catalog']`, `['scan','offline']` after an unarchive; its `refreshLive` and `onResults` use `liveRefreshFor` for the list |
| `scan/components/ShopPicker.tsx` | change | `ListGroup` "Shops" of `ListRow`s (`shops` icon, meta "Last used", `selected` on the last), final row "Stock-take at home" (`household` icon) |
| `scan/components/CameraFailure.tsx`, `ManualBarcodeEntry.tsx` | change | B4 UI on `ErrorState` (message + "Try the camera again"), secondary `Button icon` "Type the barcode instead", `TextField inputMode=numeric` + primary "Use this barcode" + tertiary "Back to the camera" |
| `scan/components/UnknownBarcodeSheet.tsx`, `IngredientCombobox.tsx` | change | `IngredientSelect` (with `onCreate`), `NumberField` pack size / weight, `UnitSelect`, `TextField`, `RadioCards` scope; `IngredientCombobox` is deleted |
| `scan/components/StockTakeSheet.tsx` | change | icon Buttons +1/−1 pack, `NumberField` "New total" |
| `scan/components/ScanFeedback.tsx`, `ScanNotices.tsx` | change | `IconButton icon="edit"` "Edit price", "Undo" text tertiary, "Dismiss" `IconButton close`; no `✎` or `×` |
| `scan/components/UnarchiveProductSheet.tsx` | new | R8 offer, props in the stub |
| `scan/screens/ScanScreen.tsx` | change | see "Scan screen" |
| `scan/scan.css` | new | tokens only |
| `scripts/check-ui.rules` | change (shared) | the Developer appends `web/src/features/shop` and `web/src/features/scan` to every rule's `fail_paths` |

## Shop screen (ShoppingScreen)
`PageHeader title="Shop"` with `actions` = `IconButton icon="add" label="Add an extra"`. Under it, a row with the range `Select` ("Shop for") and a `ShopSelect` ("Shop", placeholder "Any Shop", G3). Then, by `status`:
`loading` -> `Skeleton`; `error` -> `ErrorState "The Shopping List could not be loaded." onRetry=retry`; otherwise, **in this order**: `CelebrationTile` (when `complete`, QA: on top, before every tile), the offline note
(`stale`: "Showing the last list you loaded"; the global `OfflineBanner` is the shell's, WP5), then `ShoppingBody` (hero "Left to get" + `CostTile` with Scan, open tiles, the Ticked group), or `EmptyState` "Nothing to buy" for `empty`.
Scan shortcut: `useNavigate()('/scan')`. The old bottom "Add an extra" button is gone (header action). A pick in the `ShopSelect` calls `setShopId` and changes the `shopId` the list is fetched and priced for.

**Ticks are visible (QA):** the tick control is a `button aria-pressed` (name "Tick X" / "Untick X"), 44 x 44 px (`.line-tile__tick`, CSS contract test), an empty ring when open and a filled `tick` icon when ticked; a ticked tile has `data-state="ticked"`, title struck through and muted.

## The refetch bug (QA: about 4 requests per tick)
Cause, found in the hooks: one tick (1) invalidated `['shopping']` itself in `useShoppingActions`, then the server published `shopping`, `stock` and `plan`/`products` events and `useShoppingList` invalidated `['shopping']` again for **each**
(2 to 4). `invalidateQueries` defaults to `cancelRefetch: true`, so each call cancelled the request in flight and started a new one. (Every mounted `useShoppingList` also subscribes: the Scan screen mounts one beside Shop's.)
Fix: all paths ask a shared per-client scheduler (`liveRefreshFor`); a burst of requests becomes one invalidation 250 ms after the first (trailing), with `cancelRefetch:false`. Test: tick + the four events -> `shopApi.list` called twice in total (initial + one).
`['stock']` is a different query and is still invalidated at once after a tick that created a Lot.

## Scan screen
`ScanScreen` computes `initialChoice(shops, getLastShopId())` once the Shops have loaded (`Skeleton` until then, never the picker flashing); a hit starts the session at once (QA: no re-ask).
A session has a `PageHeader`: Shop mode `title = shop name` with a tertiary "Change Shop" action; Stock-take `title = "Stock-take at home"`, `subtitle` = hint, `leading = IconButton icon="back" label="Back"`. Both return to the picker
(the picker is then shown even with a last-used Shop: local `forcePicker` state). Picking a Shop still calls `setLastShopId`.
Camera: `ViewfinderStrip` (frozen primitive) then `CameraFailure`. Sheets: unknown, ask-weight, Stock-take, edit-price, **unarchive**. `AskWeightSheet` and `PriceEditSheet` get the same treatment as the other sheets (NumberField/ `fields`, `Button` variants); their existing tests stay and are not weakened.

### Unknown-barcode sheet
`IngredientSelect` (label "Ingredient"; `onCreate` -> `Create Ingredient "<q>"`; a created Ingredient is kept locally and saved as `{name, baseUnit}` without `id`, Base Unit from the pack unit as before), pack size `NumberField` (value
converted to the text `unknownForm` keeps: `String(n)`), `UnitSelect` over `unitOptions(base)` (`UnitChoices { baseUnit, conversions: [], globalUnits: rest }`; before an Ingredient is picked: all units), Product name `TextField` (prefilled by `suggestedName`
until edited), scope `RadioCards` with legend **"Where does this barcode apply?"** and cards "Any Shop" (hint "Every Shop you use") / "This Shop only" (hint "Only at <Shop>") (QA: the legend no longer repeats "Any Shop"). Errors are field errors (`aria-invalid`).
Weighed modes drop pack size, unit and scope; `weighed_price` adds the Weight `NumberField`.

### Stock-take outcome is a toast (QA: "-1 pack gives no toast")
`ScanFlowDeps.notify(message, status)`; `stockTakeMessage` builds "−1 pack: Passata, 700 g in Stock". Offline -> info "Waiting to sync"; rejected -> error + reject cue. The inline banner is no longer used for Stock-take results (it stays for "Not a product code", unknown at home).

### R8 archived Products
Online, before the unknown sheet for a **pack** code, `findArchived(code, shopId)` (resolve) runs; a hit opens the `unarchive` sheet "Unarchive <Product>?" with primary "Unarchive <Product>" and secondary "Create a new Product instead".
Unarchive = `POST /api/products/{id}/unarchive`, then the scan proceeds as a known Product (a `shop_scan` Op, `quantity = packSize`, no price); the controller refreshes `['products']`, `['catalog']` and the offline data.
A network error or a missing dep means no offer (offline cannot know; spec R8). The offline-created case is the backend change above: `saveUnknown` receives a rejected `barcode_archived` Result, reads the owner (`archivedOwnerId`), loads it (`fetchProduct`) and opens the same sheet.
"Create a new Product instead" shows the unknown sheet; if that is rejected with `barcode_archived` again, a warn banner explains instead of looping. For a weighed target the unarchive only notifies "Unarchived <name>. Scan it again."
(the weighed Catalog entry appears after the offline data refreshes). A Stock-take never looks for archived Products.

### useShellStatus (WP5 extension point)
`scan/index.ts` exports `useShellStatus`; `collectFeatures().statusHooks` picks it up, no shell edit. It runs on **every** screen, so it owns no sync queue or network: it counts `store.all()` of the persisted queue
(rejected operations are not stored), re-reading on a queue change (`withChangeEvents` wraps `appOpStore()`), `online`/`offline` and `visibilitychange`; a failing read counts 0. `useSyncQueue` keeps its own counts for the Scan screen.

## Native controls removed from the two folders
`UnknownBarcodeSheet` (select, radios, inputs), `IngredientCombobox` (custom listbox, replaced), `ExtraSheet` (select, inputs), `TickSheet`, `StockTakeSheet`, `ManualBarcodeEntry`, `AskWeightSheet`, `PriceEditSheet` (inputs), `LineTile` (`×` button),
`ScanFeedback` (`✎`, `×`), legacy props (`Button tonal/ghost`, `Tile tone/size/onClick`, `Chip`), the dash in `lines.ts`/`CostTile`. Guard: `shop/wp7.sources.test.ts` scans the production sources of both folders.

## Tests (all red until implemented unless noted)
Shop: `lib/{lines,range,liveRefresh}.test`, `hooks/{useShoppingList,useShoppingActions,useShopChoice}.test`, `components/{LineTile,CostTile,CelebrationTile,RangePicker,TickSheet,ExtraSheet}.test`, `components/shop.css.test` (44 px tick, struck title, 96 px tile, no hex),
`screens/ShoppingScreen.test`, `wp7.sources.test`. Scan: `lib/{initialChoice,stockTakeToast,archivedProduct,queueEvents}.test`, `api.test` (R8 calls), `hooks/{useShellStatus,useScanFlow.stocktake,useScanFlow.archived}.test`, `useScanFlow.test` (one assertion changed: Stock-take is a toast),
`components/{ShopPicker,CameraFailure,UnknownBarcodeSheet,StockTakeSheet,ScanFeedback,UnarchiveProductSheet}.test`, `screens/ScanScreen.test`. Go: `internal/scan/service` (above). BDD: none (no API change except the rejected code; covered by the service test).
Not unit-testable here: real camera, the `<video>`, torch, vibration; verify in the browser per "Verification for every screen WP" (390/820/1280, light/dark, offline).

## Decisions
- The tick control stays a `button aria-pressed` (not `Checkbox`): the line is one tile and "Untick" must stay a named action; the `Checkbox` primitive is for settings.
- `RangePicker` keeps its name and props, only its body is a `Select`, so `ShoppingBody`'s call changes only by moving it into the header.
- The Shop picker cannot return to "no Shop" (the Select has no clear option); "Any Shop" is only the initial placeholder. See QUESTIONS.
- `useShopChoice` and the Scan picker share the one `last Shop` key: choosing a Shop on the Shopping List makes it the Scan default (the same Shop is what the person means in both places).
- Coalescing window 250 ms, trailing only: a tick refreshes the list about a quarter of a second later; judged invisible next to the request time.
- The toast for Stock-take uses the shell `ToastProvider` (`useToast`); `ScanSession` must render under it (it does in the app; the ScanScreen tests mock the controller).
- Weighed codes and archived Products: scope cut as described above (offer + rescan), recorded as a deliberate limit.
