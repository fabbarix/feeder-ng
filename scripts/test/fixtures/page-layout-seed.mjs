#!/usr/bin/env node
// Seeds a scratch Feeder server for the page-layout guard (scripts/check-page-layout.sh) through the HTTP API, after dev login:
// the data set of docs/design/ui-review-2.md "How this was reviewed" (4 Members including a very long name, Meal Slots with
// attendance, 25 Ingredients, 10 Recipes incl. one very long name and a Ready Meal, 3 Shops, 8 Products with Prices, Stock Lots,
// a 7-day plan, a Shopping List with extras, 2 allowlisted Users). Writes build/page-layout-ids.json (recipeId, ingredientId,
// productId, shopId) for the guard's ":id" routes.
//   node scripts/test/fixtures/page-layout-seed.mjs http://127.0.0.1:<port> [--out build/page-layout-ids.json] [--email admin@example.test]
// Best effort: a step that the API refuses is reported on stderr and skipped (the guard then probes emptier screens, which is still
// a layout). Exit 0 whenever login worked; exit 1 when it did not.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

// Members (one very long name: F-ids in the review)
for (const [name, colour, f] of [['Anna', '#e07a5f', 1], ['Ben', '#3d405b', 1], ['Chiara', '#81b29a', 0.75], ['Lucia Maria Bernadette', '#f2cc8f', 0.5]]) {
  await step('member', 'POST', '/api/members', { name, colour, avatar: '', portionFactor: f })
}
const members = (await api('GET', '/api/members')).json ?? []
const attendance = members.slice(0, 3).map((m) => ({ memberId: m.id, portionFactorOverride: null }))

// Meal Slots: Dinner every day, Breakfast and Lunch at the weekend
for (let d = 1; d <= 7; d++) {
  await step('slot', 'POST', '/api/meal-slots', { weekday: d, name: 'Dinner', time: '19:00', attendance })
  if (d >= 6) {
    await step('slot', 'POST', '/api/meal-slots', { weekday: d, name: 'Breakfast', time: '08:30', attendance })
    await step('slot', 'POST', '/api/meal-slots', { weekday: d, name: 'Lunch', time: '13:00', attendance })
  }
}

// Ingredients
const NAMES = ['Flour', 'Rice', 'Pasta', 'Tomato', 'Onion', 'Garlic', 'Olive oil', 'Butter', 'Milk', 'Eggs', 'Chicken', 'Lentils', 'Carrot',
  'Potato', 'Cheese', 'Basil', 'Salt', 'Sugar', 'Lemon', 'Beans', 'Spinach', 'Cream', 'Mushroom', 'Pepper', 'Yoghurt']
const BASE = { Milk: 'ml', 'Olive oil': 'ml', Cream: 'ml', Eggs: 'piece', Onion: 'piece', Lemon: 'piece' }
const ing = []
for (const [i, name] of NAMES.entries()) {
  const r = await step('ingredient', 'POST', '/api/ingredients', {
    name, baseUnit: BASE[name] ?? 'g', shelfLifeDays: i % 3 === 0 ? 7 : null, conversions: [],
  })
  if (r.ok && r.json) ing.push(r.json)
}
const ingredientId = ing[0]?.id ?? 1

// Recipes (8 with several lines, one very long name, one Ready Meal)
const line = (i, n) => ({ ingredientId: ing[i % ing.length]?.id ?? 1, quantity: n, unit: ing[i % ing.length]?.baseUnit ?? 'g', optional: false, note: '' })
const RECIPES = ['Pasta al pomodoro', 'Lentil soup', 'Chicken curry', 'Risotto ai funghi', 'Spinach omelette', 'Potato gratin', 'Bean chilli',
  'Roast chicken with lemon, garlic and thyme, a very long name that wraps over lines', 'Pancakes', 'Frozen lasagne']
let recipeId = 1
for (const [i, name] of RECIPES.entries()) {
  const ready = name === 'Frozen lasagne'
  const r = await step('recipe', 'POST', '/api/recipes', {
    name, description: 'A seeded recipe for the layout guard.', yield: 4, readyMeal: ready, tags: i % 2 ? ['easy'] : ['quick', 'family'],
    lines: ready ? [line(14, 400)] : [line(i, 200), line(i + 3, 100), line(i + 5, 50)],
    steps: ready ? [] : [{ text: 'Prepare everything.', kind: 'active', durationMinutes: 10, leadTimeMinutes: 0, after: [], uses: [] }, { text: 'Cook it.', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [0], uses: [] }],
  })
  if (r.ok && r.json?.id && i === 0) recipeId = r.json.id
}

// Shops, Products with Prices
const shops = []
for (const name of ['Coop', 'Market Hall', 'Corner Shop']) {
  const r = await step('shop', 'POST', '/api/shops', { name })
  if (r.ok && r.json) shops.push(r.json)
}
const shopId = shops[0]?.id ?? 1
let productId = 1
for (let i = 0; i < 8; i++) {
  const item = ing[i]
  if (!item) break
  const r = await step('product', 'POST', '/api/products', { name: `${item.name} ${i % 2 ? 'organic ' : ''}pack`, ingredientId: item.id, packSize: 500, barcodes: [ean13(`800000000${100 + i}`.slice(0, 12))] })
  if (!r.ok || !r.json?.id) continue
  if (i === 0) productId = r.json.id
  if (shops[0]) await step('price', 'PUT', `/api/products/${r.json.id}/prices`, { shopId: shops[0].id, date: new Date().toISOString().slice(0, 10), priceCents: 199 + i * 25 })
  if (i === 7) await step('archive', 'POST', `/api/products/${r.json.id}/archive`)
}

// Stock Lots (the Stock screen), a Shopping List extra, two allowlisted Users
const today = new Date().toISOString().slice(0, 10)
for (let i = 0; i < 11; i++) {
  const item = ing[i % ing.length]
  if (item) await step('lot', 'POST', '/api/stock/lots', { ingredientId: item.id, quantity: 250 + i * 40, purchased: today, source: 'manual', clientUuid: `layout-seed-${i}` })
}
if (ing[3]) await step('extra', 'POST', '/api/shopping/extras', { text: 'Napkins', ingredientId: 0, quantity: 1 })
for (const [e, n] of [['guest.one@example.test', 'Guest One'], ['guest.two@example.test', 'Guest Two']]) {
  await step('allowlist', 'POST', '/api/allowlist', { email: e, displayName: n, isAdmin: false })
}
await step('plan', 'POST', '/api/plan/regenerate', {})

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ recipeId, ingredientId, productId, shopId }, null, 2) + '\n')
console.log(`page-layout-seed: ok (${members.length} members, ${ing.length} ingredients, ${shops.length} shops) -> ${out}`)
