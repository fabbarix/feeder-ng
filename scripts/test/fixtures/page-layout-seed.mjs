#!/usr/bin/env node
// Seeds a scratch Feeder server for the page-layout guard (scripts/check-page-layout.sh) through the HTTP API, after dev login:
// the data set of docs/design/ui-review-2.md "How this was reviewed" (4 Members including a very long name, Meal Slots with
// attendance, 25 Ingredients, 10 Recipes incl. one very long name and a Ready Meal, 3 Shops, 8 Products with Prices, Stock Lots,
// a 7-day plan, a Shopping List with extras, 2 allowlisted Users), plus (DS-A) long realistic names, a Side Course and Planned
// Meals not marked Cooked yet. Writes build/page-layout-ids.json (recipeId, ingredientId,
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
// DS-SHOP: a long free-text extra, so the Shop row's two-line title (word wrap, then an ellipsis) is exercised at 834 and 1024 px
await step('extra', 'POST', '/api/shopping/extras', { text: 'Extra virgin olive oil, cold pressed, from the farm shop near the station' })
for (const [e, n] of [['guest.one@example.test', 'Guest One'], ['guest.two@example.test', 'Guest Two']]) {
  await step('allowlist', 'POST', '/api/allowlist', { email: e, displayName: n, isAdmin: false })
}
// DS-A (ADR 0016): realistic long names, a Side Course and Planned Meals not marked Cooked yet, so the guard sees what an iPad
// showed in beta.5 ("Cauliflo/wer", "cau-/liflower with pep-/pers", the "Includes Thu Dinner, not marked Cooked yet" hint).
const LONG = [['Cauliflower', 'g'], ['Gorgonzola', 'g'], ['Chestnut mushrooms', 'g'], ['Cucumber', 'piece'], ['Red pepper', 'piece'], ['Feta', 'g'], ['Marjoram', 'g']]
const longIng = {}
for (const [name, unit] of LONG) {
  const r = await step('ingredient', 'POST', '/api/ingredients', { name, baseUnit: unit, shelfLifeDays: 5, conversions: [] })
  if (r.ok && r.json) longIng[name] = r.json
}
const lineOf = (name, q) => ({ ingredientId: longIng[name]?.id ?? ingredientId, quantity: q, unit: longIng[name]?.baseUnit ?? 'g', optional: false, note: '' })
const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
await api('POST', '/api/courses', { name: 'Side' }) // a default Course on a fresh Household (409 then)
const courses = listOf(await api('GET', '/api/courses'))
const mainCourse = courses.find((c) => c.main) ?? courses.find((c) => c.name === 'Main')
const sideCourse = courses.find((c) => c.name === 'Side')
const cook = [{ text: 'Prepare and cook.', kind: 'active', durationMinutes: 15, leadTimeMinutes: 0, after: [], uses: [] }]
const sideIds = []
for (const [name, lines] of [
  ['Two-colour cauliflower with peppers', [lineOf('Cauliflower', 1500), lineOf('Red pepper', 2), lineOf('Marjoram', 2)]],
  ['Cucumber tomato feta salad', [lineOf('Cucumber', 2), lineOf('Feta', 150), line(3, 200)]],
]) {
  const r = await step('side recipe', 'POST', '/api/recipes', { name, description: '', yield: 4, readyMeal: false, tags: ['vegetarian'], courseIds: sideCourse ? [sideCourse.id] : undefined, lines, steps: cook })
  if (r.ok && r.json?.id) sideIds.push(r.json.id)
}
const mainR = await step('main recipe', 'POST', '/api/recipes', {
  name: 'Cauliflower al gorgonzola with chestnut mushrooms', description: '', yield: 4, readyMeal: false, tags: ['vegetarian'],
  lines: [lineOf('Cauliflower', 1000), lineOf('Gorgonzola', 250), lineOf('Chestnut mushrooms', 300)], steps: cook,
})
// Dinner serves Main and Side (a Meal Slot PATCH takes the whole slot)
if (mainCourse && sideCourse) {
  for (const slot of listOf(await api('GET', '/api/meal-slots')).filter((x) => x.name === 'Dinner')) {
    const { id, ...body } = slot
    await step('dinner courses', 'PATCH', `/api/meal-slots/${id}`, { ...body, courses: [mainCourse, sideCourse].map((c) => ({ id: c.id, optional: false, optOutMemberIds: [] })) })
  }
}
// Planned Meals not marked Cooked yet (the "to-confirm" list): there is no clock to move, so the Household's time zone is moved
// instead. In Pago Pago (UTC-11) tonight's or tomorrow's Dinner is still ahead and can be planned; in Kiritimati (UTC+14) the
// same date is 25 hours later, so that Dinner is more than two hours past and waits to be confirmed. Best effort: in one hour a
// day (19:00-20:00 Pago Pago time) neither date works and the guard runs without a To confirm tile.
const setZone = async (timeZone) => {
  const cur = (await api('GET', '/api/household/settings')).json
  if (!cur) return
  const { timeZoneConfigured, ...rest } = cur
  await step('time zone', 'PUT', '/api/household/settings', { ...rest, timeZone })
}
await setZone('Pacific/Pago_Pago')
await step('plan', 'POST', '/api/plan/regenerate', {})
const pagoDate = (days) => new Date(Date.now() - 11 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const planned = (await api('GET', '/api/plan')).json?.slots ?? []
for (const s of planned.filter((x) => x.name === 'Dinner' && [pagoDate(0), pagoDate(1)].includes(x.date))) {
  for (const c of s.courses ?? []) {
    const rid = c.courseId === sideCourse?.id ? sideIds[0] : mainR.json?.id
    if (rid) await api('PUT', `/api/plan/${s.date}/${s.mealSlotId}/${c.courseId}`, { recipeId: rid }) // a past slot refuses: expected
  }
}
// DS-A: the Plan chip line (system.md §6). A long-named Side with a big Yield (so its Leftovers are planned: "Leftover for …" on
// the day it is cooked, "Leftover from …" where it is served), two Members' favourite on a planned Recipe ("Anna and Ben's
// favourite") and a Slot Rule ("Slot Rule: Monday"), so the guard stresses one-line chips on /plan and / at 834 and 1024.
const longSide = await step('long side', 'POST', '/api/recipes', {
  name: 'Roasted two-colour cauliflower with sweet peppers, capers and marjoram', description: '', yield: 10, readyMeal: false, tags: ['vegetarian'],
  courseIds: sideCourse ? [sideCourse.id] : undefined, lines: [lineOf('Cauliflower', 2000), lineOf('Red pepper', 3), lineOf('Marjoram', 3)], steps: cook,
})
if (longSide.ok && longSide.json?.id) sideIds.unshift(longSide.json.id)
const favId = mainR.json?.id
if (favId) for (const m of members.slice(0, 2)) await step('favourite', 'PUT', `/api/recipes/${favId}/preference`, { state: 'favourite', memberId: m.id })
const mondayDinner = listOf(await api('GET', '/api/meal-slots')).find((x) => x.name === 'Dinner' && x.weekday === 1)
if (mondayDinner && mainCourse && favId) await step('slot rule', 'POST', '/api/slot-rules', { mealSlotId: mondayDinner.id, courseId: mainCourse.id, recipeId: favId })
await setZone('Pacific/Kiritimati')
await step('plan', 'POST', '/api/plan/regenerate', {})
// Tomorrow's Dinner Side: the long Side, two Batches, so it leaves Leftovers for a later Dinner; the regenerate then plans them.
const ahead = ((await api('GET', '/api/plan')).json?.slots ?? []).filter((x) => x.name === 'Dinner' && x.date > (new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10)))
const tomorrowDinner = ahead[0]
if (tomorrowDinner && sideCourse && longSide.json?.id) {
  await step('side batches', 'PUT', `/api/plan/${tomorrowDinner.date}/${tomorrowDinner.mealSlotId}/${sideCourse.id}`, { recipeId: longSide.json.id, batches: 2 })
  await step('plan', 'POST', '/api/plan/regenerate', {})
}
const toConfirm = ((await api('GET', '/api/plan/to-confirm')).json?.slots ?? []).length

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ recipeId, ingredientId, productId, shopId, toConfirm }, null, 2) + '\n')
console.log(`page-layout-seed: ok (${members.length} members, ${ing.length} ingredients, ${shops.length} shops, toConfirm ${toConfirm}) -> ${out}`)
