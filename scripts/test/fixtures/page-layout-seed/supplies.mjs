// The page-layout seed, supplies area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// Supplies with Products, Prices and Stock (the Supplies scenarios and the Shop list's Supplies group).
// seed(ctx) reads step, ean13, shops, today from ctx and adds supplyId.

export async function seed(ctx) {
  const { step, ean13, shops, today } = ctx
  // beta.7 (H8): Supplies (docs/dev/design/household-items.md). A g or ml one below its Restock level with Stock to use (the guard
  // opens its quick-Use sheet on /supplies, and its Line shows in the Shop list's Supplies group), a piece one below its level and
  // one with a long name above it. Each has a Product with a Price at the first Shop, so its Line shows packs and a cost.
  const SUPPLIES = [
    { name: 'Washing-up liquid', baseUnit: 'ml', restockLevel: 1000, stock: 400, pack: 750, price: 249 },
    { name: 'Kitchen roll', baseUnit: 'piece', restockLevel: 4, stock: 2, pack: 4, price: 349 },
    { name: 'Dishwasher tablets, lemon fresh, all-in-one with salt and rinse aid', baseUnit: 'piece', restockLevel: 20, stock: 60, pack: 40, price: 899 },
  ]
  let supplyId = null
  for (const [i, sup] of SUPPLIES.entries()) {
    const r = await step('supply', 'POST', '/api/ingredients', { name: sup.name, baseUnit: sup.baseUnit, kind: 'supply', restockLevel: sup.restockLevel, conversions: [] })
    if (!r.ok || !r.json?.id) continue
    if (supplyId === null) supplyId = r.json.id
    const p = await step('supply product', 'POST', '/api/products', { name: `${sup.name} ${sup.pack} ${sup.baseUnit === 'piece' ? 'pack' : sup.baseUnit}`, ingredientId: r.json.id, packSize: sup.pack, barcodes: [ean13(`80000000030${i}`)] })
    if (p.ok && p.json?.id && shops[0]) await step('supply price', 'PUT', `/api/products/${p.json.id}/prices`, { shopId: shops[0].id, date: today, priceCents: sup.price })
    await step('supply lot', 'POST', '/api/stock/lots', { ingredientId: r.json.id, quantity: sup.stock, purchased: today, source: 'manual', clientUuid: `layout-seed-supply-${i}` })
  }
  Object.assign(ctx, { supplyId })
}
