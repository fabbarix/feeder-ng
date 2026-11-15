#!/usr/bin/env node
// Seeds a scratch Feeder server for the page-layout guard (scripts/check-page-layout.sh) through the HTTP API, after dev login:
// the data set of docs/design/ui-review-2.md "How this was reviewed" (4 Members including a very long name, Meal Slots with
// attendance, 25 Ingredients, 10 Recipes incl. one very long name and a Ready Meal, 3 Shops, 8 Products with Prices, Stock Lots,
// a 7-day plan, a Shopping List with extras, 2 allowlisted Users), plus (DS-A) long realistic names, a Side Course and Planned
// Meals not marked Cooked yet, and (beta.7) Supplies, the Scan session's barcodes and the Recipe Assistant on the fake Anthropic
// API. Writes build/page-layout-ids.json (recipeId, ingredientId, productId, shopId, supplyId, ...) for the guard's ":id" routes
// and its scenarios.
//   node scripts/test/fixtures/page-layout-seed.mjs http://127.0.0.1:<port> [--out build/page-layout-ids.json] [--email admin@example.test]
// B9-03: the steps live in page-layout-seed/<area>.mjs (index.mjs runs them in order); this file signs in, gives them the helpers and
// writes the ids file.
// Best effort: a step that the API refuses is reported on stderr and skipped (the guard then probes emptier screens, which is still
// a layout). Exit 0 whenever login worked; exit 1 when it did not, or when the Side Recipe with LONG_TAG was not created (the guard's
// filtered /recipes scenarios would then show no Recipe, so they must not pass quietly), or when the ten Storage Places were not all
// created (pantry-filter: the filtered /pantry scenarios need the long-named one, longPlaceId in the ids file).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { seedAll } from './page-layout-seed/index.mjs'
import { PLACES } from './page-layout-seed/stock.mjs'

const args = process.argv.slice(2)
const base = (args.find((a) => /^https?:/.test(a)) ?? '').replace(/\/$/, '')
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
if (!base) {
  console.error('page-layout-seed: pass the server URL, e.g. http://127.0.0.1:20000')
  process.exit(2)
}
const out = opt('out', 'build/page-layout-ids.json')
const email = opt('email', 'admin@example.test')

const FETCH_TIMEOUT_MS = Number(process.env.PAGE_LAYOUT_FETCH_TIMEOUT_MS) || 10000
let cookie = ''
const api = async (method, path, body) => {
  let res
  let text = ''
  try {
    res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), // a hung server must not hang the seeder (the wrapper adds an overall limit)
    })
    const set = res.headers.getSetCookie?.() ?? []
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
    text = await res.text()
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e?.message ?? e) } // timeout or refused: reported like a refused step
  }
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not JSON */
  }
  return { ok: res.ok, status: res.status, json, text }
}
const step = async (what, method, path, body) => {
  const r = await api(method, path, body)
  if (!r.ok) console.error(`page-layout-seed: ${what} failed (${method} ${path} -> ${r.status} ${r.text.slice(0, 120)})`)
  return r
}

// EAN-13 with a valid check digit from its first 12 digits.
const ean13 = (d12) => d12 + ((10 - ([...d12].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10)

const login = await api('POST', '/api/dev/login', { email })
if (!login.ok) {
  console.error(`page-layout-seed: dev login failed (${login.status}); is FEEDER_DEV_LOGIN=1 set?`)
  process.exit(1)
}

const ctx = await seedAll({ api, step, ean13 })
const { members, ing, shops, recipeId, ingredientId, productId, shopId, toConfirm, sideCourse, longTagRecipe, LONG_TAG, placeIds, longPlaceId } = ctx
const { supplyId, scanBarcodes, unknownBarcode, assistant } = ctx

mkdirSync(dirname(out), { recursive: true })
// hf-recipes-filter round 2: the filtered /recipes scenarios of the guard (page-layout-rules.mjs SCENARIOS) read these two.
const sideCourseId = sideCourse?.id ?? null
// beta.7: the Supply page, the Scan session's Shop and codes, and whether the assistant is on (the guard's beta.7 scenarios).
const beta7 = { supplyId, shopName: shops[0]?.name ?? null, scanBarcodes, unknownBarcode, assistant }
// B9-40 review: the rich Cook Mode Recipe (page-layout-seed/cook.mjs: Advance Steps, a Step photo) of the cook-step scenarios.
const cookRecipeId = ctx.cookRecipeId ?? null
writeFileSync(out, JSON.stringify({ ...beta7, recipeId, ingredientId, productId, shopId, toConfirm, sideCourseId, longTag: LONG_TAG, cookRecipeId, longPlaceId }, null, 2) + '\n')
if (longTagRecipe === null || sideCourseId === null) {
  console.error(`page-layout-seed: the Side Recipe tagged "${LONG_TAG}" was not created; the filtered /recipes scenarios would show no Recipe`)
  process.exit(1)
}
// pantry-filter: the filtered /pantry scenarios need the long-named Storage Place (and the ten places that make the list overflow).
if (longPlaceId === null || placeIds.length < PLACES.length) {
  console.error(`page-layout-seed: the Storage Places were not all created (${placeIds.length} of ${PLACES.length}); the filtered /pantry scenarios need them`)
  process.exit(1)
}
// beta.7 (H8): the Supply page and the quick-Use scenario need the first Supply.
if (supplyId === null) {
  console.error('page-layout-seed: the Supplies were not created; /supplies/:id and the quick-Use scenario need them')
  process.exit(1)
}
console.log(`page-layout-seed: ok (${members.length} members, ${ing.length} ingredients, ${shops.length} shops, ${placeIds.length} Storage Places, toConfirm ${toConfirm}) -> ${out}`)
