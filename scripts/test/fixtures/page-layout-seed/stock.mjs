// The page-layout seed, stock area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// Ten Storage Places (one 60-character name), Stock Lots and a Use soon Lot; then, kept here so the API calls (and every id) come in
// the order of the one-file seed, two Shopping List extras and two allowlisted Users.
// seed(ctx) reads step, ing from ctx and adds placeIds, longPlaceId, today.

// pantry-filter: ten Storage Places (docs/design/pantry-filter.md 10), so the Pantry's Storage Place list scrolls and its chip line
// overflows. One has a 60-character name, the API's limit (internal/stock/store maxPlaceName); it is a pantry, so a Lot in it keeps its
// own Shelf Life (a freezer would use the frozen one) and can be Use soon. The guard's /pantry scenarios filter by Use soon and it.
export const LONG_PLACE = 'Basement pantry shelves behind the boiler, bottom left shelf'
export const PLACES = [
  ['Kitchen Pantry', 'pantry'], ['Kitchen Fridge', 'fridge'], ['Kitchen Freezer', 'freezer'], ['Garage Fridge', 'fridge'],
  ['Garage Freezer', 'freezer'], ['Cellar Shelves', 'pantry'], ['Utility Room Cupboard', 'pantry'], ['Drinks Fridge', 'fridge'],
  ['Spare Chest Freezer', 'freezer'], [LONG_PLACE, 'pantry'],
]

export async function seed(ctx) {
  const { step, ing } = ctx
  const placeIds = []
  let longPlaceId = null
  for (const [name, kind] of PLACES) {
    const r = await step('storage place', 'POST', '/api/storage-places', { name, kind })
    if (r.ok && r.json?.id) {
      placeIds.push(r.json.id)
      if (name === LONG_PLACE) longPlaceId = r.json.id
    }
  }

  // Stock Lots (the Stock screen), a Shopping List extra, two allowlisted Users. pantry-filter: one Lot per Storage Place, the last one
  // Not sorted, and a Use soon Lot in the long-named place (Flour keeps 7 days, bought 5 days ago: good for 2 more).
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < 11; i++) {
    const item = ing[i % ing.length]
    const storagePlaceId = placeIds[i] // undefined past the last place: Not sorted
    if (item) await step('lot', 'POST', '/api/stock/lots', { ingredientId: item.id, quantity: 250 + i * 40, purchased: today, source: 'manual', clientUuid: `layout-seed-${i}`, storagePlaceId })
  }
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400e3).toISOString().slice(0, 10)
  if (ing[0] && longPlaceId) {
    await step('use-soon lot', 'POST', '/api/stock/lots', { ingredientId: ing[0].id, quantity: 500, purchased: fiveDaysAgo, source: 'manual', clientUuid: 'layout-seed-use-soon', storagePlaceId: longPlaceId })
  }
  if (ing[3]) await step('extra', 'POST', '/api/shopping/extras', { text: 'Napkins', ingredientId: 0, quantity: 1 })
  // DS-SHOP: a long free-text extra, so the Shop row's two-line title (word wrap, then an ellipsis) is exercised at 834 and 1024 px
  await step('extra', 'POST', '/api/shopping/extras', { text: 'Extra virgin olive oil, cold pressed, from the farm shop near the station' })
  for (const [e, n] of [['guest.one@example.test', 'Guest One'], ['guest.two@example.test', 'Guest Two']]) {
    await step('allowlist', 'POST', '/api/allowlist', { email: e, displayName: n, isAdmin: false })
  }
  Object.assign(ctx, { placeIds, longPlaceId, today })
}
