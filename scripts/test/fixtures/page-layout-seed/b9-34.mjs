// B9-34 (SSP-01, SSP-02, SSP-18; plan section 9 "hand, scan and more-since ticks"): ticked Lines for the `shop-ticked` scenario, so the
// Shop's Ticked group has rows whose meta says what the tick did (P23 measures them at 375, 390 and 1120/1440).
//   - one Line ticked by hand with its default amount (meta "+… in Stock", the success tone);
//   - one Line ticked by hand without adding Stock (meta "Not added to Stock", compact "No Stock added").
// Best effort, like every area: a step the API refuses is reported and skipped. What this seed cannot do through the API alone is left to
// the developer, who has the running server and the Go side (B9-API-NOTES, B9-23): (1) a Line ticked by a Scan ("Scanned · 700 g"), through
// POST /api/scan/sync with a scan op for a seeded barcode; (2) a Line that grew after its tick (the "more since your tick" row), by pinning
// a second Batch of a Recipe after the tick. Add them below and set scanTickedId / moreSinceId; `shop-ticked` reads them when present.
// seed(ctx) reads step, shops from ctx and adds tickedHandId, tickedNoStockId, scanTickedId (null), moreSinceId (null).

export const order = 340

export async function seed(ctx) {
  const { step, shops } = ctx
  const shopId = shops?.[0]?.id ?? null
  const list = await step('shop list', 'GET', shopId ? `/api/shopping/list?shop=${shopId}` : '/api/shopping/list')
  const lines = (list.ok ? list.json?.lines : null) ?? []
  const to = list.json?.to
  const open = lines.filter((l) => !l.ticked && l.kind !== 'supply' && l.ingredientId)
  let tickedHandId = null
  let tickedNoStockId = null
  if (to && open[0]) {
    // the phone's one-tap amount: the suggested pack (count x size), else what is still to get
    const l = open[0]
    const quantity = l.pack ? l.pack.count * l.pack.size : l.quantity
    const r = await step('tick by hand', 'POST', '/api/shopping/ticks', { ingredientId: l.ingredientId, to, quantity, shopId, clientUuid: 'layout-seed-tick-hand' })
    if (r.ok) tickedHandId = l.ingredientId
  }
  if (to && open[1]) {
    const r = await step('tick without adding', 'POST', '/api/shopping/ticks', { ingredientId: open[1].ingredientId, to, quantity: 0, shopId, clientUuid: 'layout-seed-tick-none' })
    if (r.ok) tickedNoStockId = open[1].ingredientId
  }
  Object.assign(ctx, { tickedHandId, tickedNoStockId, scanTickedId: null, moreSinceId: null })
}
