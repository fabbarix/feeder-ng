// The page-layout seed, shops area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// 3 Shops and 8 Products with barcodes and Prices at the first Shop (one archived).
// seed(ctx) reads step, ean13, ing from ctx and adds shops, shopId, productId.

export async function seed(ctx) {
  const { step, ean13, ing } = ctx
  // Shops, Products with Prices
  const shops = []
  for (const name of ['Coop', 'Market Hall', 'Corner Shop']) {
    const r = await step('shop', 'POST', '/api/shops', { name })
    if (r.ok && r.json) shops.push(r.json)
  }
  const shopId = shops[0]?.id ?? 1
  let productId = 1
  // A pack in the Ingredient's own Base Unit: 500 g or 500 ml, but a few pieces (the Onion pack was "500 pieces").
  const PACK = { g: 500, ml: 500, piece: 6 }
  for (let i = 0; i < 8; i++) {
    const item = ing[i]
    if (!item) break
    const r = await step('product', 'POST', '/api/products', { name: `${item.name} ${i % 2 ? 'organic ' : ''}pack`, ingredientId: item.id, packSize: PACK[item.baseUnit] ?? 500, barcodes: [ean13(`800000000${100 + i}`.slice(0, 12))] })
    if (!r.ok || !r.json?.id) continue
    if (i === 0) productId = r.json.id
    if (shops[0]) await step('price', 'PUT', `/api/products/${r.json.id}/prices`, { shopId: shops[0].id, date: new Date().toISOString().slice(0, 10), priceCents: 199 + i * 25 })
    if (i === 7) await step('archive', 'POST', `/api/products/${r.json.id}/archive`)
  }
  Object.assign(ctx, { shops, shopId, productId })
}
