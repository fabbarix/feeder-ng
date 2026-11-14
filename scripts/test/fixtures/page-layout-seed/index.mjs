// The page-layout seed by area (B9-03). scripts/test/fixtures/page-layout-seed.mjs signs in, builds the context (api, step, ean13)
// and calls seedAll(ctx); each area's seed(ctx) reads what the areas before it added to ctx and adds its own. The seven base areas run
// first, in the order of the API calls of the one-file seed, so every id is what it was.
// A package adds its own seed step as page-layout-seed/<area>.mjs, exporting `seed(ctx)` and `order` (a number from 100 up), and edits
// nothing here: the other areas of this directory are found and run after the base ones, by `order`, then by file name. A file that is
// not an .mjs module, or a module without seed() or order, stops the seed and is named.
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { seed as household } from './household.mjs'
import { seed as recipes } from './recipes.mjs'
import { seed as shops } from './shops.mjs'
import { seed as stock } from './stock.mjs'
import { seed as plan } from './plan.mjs'
import { seed as supplies } from './supplies.mjs'
import { seed as scan } from './scan.mjs'

const BASE = { household, recipes, shops, stock, plan, supplies, scan }
const here = dirname(fileURLToPath(import.meta.url))

const extra = []
for (const file of readdirSync(here).sort()) {
  if (file.startsWith('.') || file === 'index.mjs') continue
  if (!file.endsWith('.mjs')) throw new Error(`page-layout-seed/${file}: only <area>.mjs modules go here`)
  const area = file.slice(0, -4)
  if (BASE[area]) continue
  const mod = await import(pathToFileURL(`${here}/${file}`).href)
  if (typeof mod.seed !== 'function' || typeof mod.order !== 'number' || mod.order < 100) {
    throw new Error(`page-layout-seed/${file}: export seed(ctx) and order (a number from 100 up)`)
  }
  extra.push({ area, order: mod.order, seed: mod.seed })
}
extra.sort((a, b) => a.order - b.order || (a.area < b.area ? -1 : 1))

const SEEDS = { ...BASE, ...Object.fromEntries(extra.map((x) => [x.area, x.seed])) }
/** The areas, in the order they run. */
export const AREAS = Object.keys(SEEDS)

/** Runs every area in order on one context. */
export async function seedAll(ctx) {
  for (const area of AREAS) await SEEDS[area](ctx)
  return ctx
}
