// The page-layout seed by area (B9-03). scripts/test/fixtures/page-layout-seed.mjs signs in, builds the context (api, step, ean13)
// and calls seedAll(ctx); each area's seed(ctx) reads what the areas before it added to ctx and adds its own. The areas run in this
// order, which is the order of the API calls of the one-file seed, so every id is what it was. A package adds its own seed step as
// page-layout-seed/<area>.mjs and appends its area here (plan section 5), never in the middle: an area run earlier changes later ids.
import { seed as household } from './household.mjs'
import { seed as recipes } from './recipes.mjs'
import { seed as shops } from './shops.mjs'
import { seed as stock } from './stock.mjs'
import { seed as plan } from './plan.mjs'
import { seed as supplies } from './supplies.mjs'
import { seed as scan } from './scan.mjs'

const SEEDS = { household, recipes, shops, stock, plan, supplies, scan }
/** The areas, in the order they run. */
export const AREAS = Object.keys(SEEDS)

/** Runs every area in order on one context. */
export async function seedAll(ctx) {
  for (const area of AREAS) await SEEDS[area](ctx)
  return ctx
}
