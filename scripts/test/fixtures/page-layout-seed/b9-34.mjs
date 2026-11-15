// B9-34 (SSP-01, SSP-02, SSP-18; plan section 9 "hand, scan and more-since ticks"): ticked Lines for the `shop-ticked` scenario, so the
// Shop's Ticked group has rows of every kind whose meta says what the tick did (P23 measures them at 375, 390, 834 and 1440):
//   - one Line ticked by hand with its default amount, then a second hand addition on it (meta "Added twice · you …, you …", success);
//   - one Line ticked by hand without adding Stock (meta "Not added to Stock", compact "No Stock added");
//   - one Line ticked by a Scan (meta "Scanned · …"): a Product of its Ingredient, scanned through POST /api/scan/sync (shop_scan) for at
//     least what the Line needs, so the scanned Lot ticks it;
//   - one Line with "more since your tick" (SSP-02): a queued hand tick (shop_tick) that covered only half of the Line and added a
//     quarter, so the server shows the rest as More (moreSinceTick: q2 - max(0, q0 - added)) and the Line is in To get again.
// Best effort, like every area: a step the API refuses is reported and skipped; the scenario's setup says which kind is missing.
// seed(ctx) reads step, ean13, shops from ctx and adds tickedHandId, tickedNoStockId, scanTickedId, moreSinceId.

export const order = 340

export async function seed(ctx) {
  const { step, ean13, shops } = ctx
  const shopId = shops?.[0]?.id ?? null
  const list = await step('shop list', 'GET', shopId ? `/api/shopping/list?shop=${shopId}` : '/api/shopping/list')
  const lines = (list.ok ? list.json?.lines : null) ?? []
  const to = list.json?.to
  // food Lines only (Supplies sit in their own group), of 4 or more Base Units, so a half and a quarter of one are whole numbers
  const open = lines.filter((l) => !l.ticked && l.kind !== 'supply' && l.ingredientId && l.quantity >= 4)
  const now = () => new Date().toISOString()
  const applied = (r) => r.ok && r.json?.results?.[0]?.status !== 'rejected'
  let tickedHandId = null
  let tickedNoStockId = null
  let scanTickedId = null
  let moreSinceId = null
  if (to && open[0]) {
    // the phone's one-tap amount: the suggested pack (count x size), else what is still to get; then a second addition (RES 2)
    const l = open[0]
    const quantity = l.pack ? l.pack.count * l.pack.size : l.quantity
    const r = await step('tick by hand', 'POST', '/api/shopping/ticks', { ingredientId: l.ingredientId, to, quantity, shopId, clientUuid: 'layout-seed-tick-hand' })
    if (r.ok) {
      tickedHandId = l.ingredientId
      const second = { ingredientId: l.ingredientId, to, quantity: Math.max(1, Math.round(quantity / 2)), shopId, clientUuid: 'layout-seed-tick-hand-2' }
      await step('a second hand addition', 'POST', '/api/shopping/ticks', second)
    }
  }
  if (to && open[1]) {
    const r = await step('tick without adding', 'POST', '/api/shopping/ticks', { ingredientId: open[1].ingredientId, to, quantity: 0, shopId, clientUuid: 'layout-seed-tick-none' })
    if (r.ok) tickedNoStockId = open[1].ingredientId
  }
  if (to && open[2]) {
    // a Scan's tick: a Product of the Line's Ingredient, scanned for at least what the Line needs
    const l = open[2]
    const packSize = Math.ceil(l.quantity)
    const p = await step('scan product', 'POST', '/api/products', { name: `${l.name} seed scan pack`, ingredientId: l.ingredientId, packSize, barcodes: [ean13('800000000340')] })
    if (p.ok && p.json?.id) {
      const op = { clientUuid: 'layout-seed-scan-tick', scannedAt: now(), kind: 'shop_scan', shopId, rangeTo: to, productId: p.json.id, quantity: packSize }
      if (applied(await step('scan that ticks a Line', 'POST', '/api/scan/sync', { ops: [op] }))) scanTickedId = l.ingredientId
    }
  }
  if (to && open[3]) {
    // more since your tick: a queued hand tick that covered half the Line and added a quarter of it
    const l = open[3]
    const op = { clientUuid: 'layout-seed-more-since', scannedAt: now(), kind: 'shop_tick', ingredientId: l.ingredientId, quantity: Math.round(l.quantity / 4), covers: Math.round(l.quantity / 2), rangeTo: to, shopId }
    if (applied(await step('tick that leaves more', 'POST', '/api/scan/sync', { ops: [op] }))) moreSinceId = l.ingredientId
  }
  Object.assign(ctx, { tickedHandId, tickedNoStockId, scanTickedId, moreSinceId })
}
