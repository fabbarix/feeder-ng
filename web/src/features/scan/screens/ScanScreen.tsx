/**
 * The Scan screen (centre button, route /scan). First "Where are you shopping?" (ShopPicker over useShops(), the
 * last Shop used first; choosing one remembers it with setLastShopId; "Stock-take at home" starts Stock-take).
 * Then, with useScanController({ mode, shop }):
 *   - a `ViewfinderStrip` (ui) with the <video ref={camera.videoRef}>, torch and mute props, status line from the
 *     camera status ("Starting the camera", "The camera is blocked. ...", "This browser cannot open the camera ...");
 *   - in Shop mode the live list below it (LiveList: a compact, thumb-reach list of the open items "Passata · 1400 g ·
 *     2 × Mutti 700 g" and "<n> left", the ticked ones struck through), a "Change Shop" button;
 *   - the `ScanFeedback` line for flow.feedback (Undo -> flow.undo, ✎ -> flow.openEditPrice) and flow.banner;
 *   - the offline note "Offline: scans are kept and sent when you are back online", "<n> scans waiting to sync",
 *     and the sync notices (dismissable);
 *   - the sheets of flow.sheet: unknown -> UnknownBarcodeSheet, ask_weight -> AskWeightSheet, stock_take ->
 *     StockTakeSheet, edit_price -> PriceEditSheet; closing calls flow.closeSheet;
 *   - while mode is 'shop' the screen marks a scan session active (useScanSession(true)).
 * Render and wire only. Stub until implemented.
 */
export function ScanScreen() {
  return null
}
