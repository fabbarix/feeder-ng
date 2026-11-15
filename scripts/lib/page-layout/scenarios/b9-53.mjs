// B9-53 (plan sections 6 and 9; TB-06): the first-run checklist on a real screen. TEST-AUTHOR scenarios: each setup ASSERTS what the chapter's guard names and throws
// when it does not hold, so a scenario is "not inspected" (a failure) until the tile is built. No rule number of its own: the setups measure and throw.
//
// AN EMPTY HOUSEHOLD, how (plan section 9: "an empty Household (B9-53)"): the guard's server is one seeded Household and cannot be emptied (Members and Meal
// Slots keep history). So the scenario starts the page with a fetch stub installed before the app (the `emulate` hook, as b9-52's share sheet does): GETs of
// /api/members, /api/meal-slots, /api/recipes and the slots of /api/plan answer as a new Household would (empty lists), GET /api/household/settings answers
// the real settings with the overrides of the scenario's state (timeZone UTC, timeZoneConfigured false, setupHidden false by default), and PUT
// /api/household/settings changes the stub's copy only. Everything else is the real seeded server, so nothing the guard seeded is touched. The stubs live in
// the page (window.__firstRun) so a setup can read what was saved.
//   first-run-zone      / at 375, 390, 834: the empty Household. The setup tile leads Today (the first tile, or second after Shopping); five steps in an ol with exactly one
//                       aria-current; the current step is time zone and currency with a "Detected settings" ul of two rows (key, state, detail one line, a
//                       Change button on the detail's line); "Looks right" is the one primary; no link to a list page; no tertiary button; every button name unique
//                       (P38). Then Looks right is pressed: the stub saved a zone and currency, focus is on "Add a Member", and the polite status says "Step 1 of 5 done.".
//   first-run-member    / at 375, 390, 667x375: zone confirmed, no Members: Add a Member opens a sheet over Today (the page does not navigate) with the caption, the circular Close
//                       and NO Cancel, "Save and add another" and "Save" each on one line in the footer, the footer inside the viewport.
//   first-run-slots     / at 375, 390, 667x375: Members present, no Meal Slots: Set up Meal Slots opens "When do you eat?" with three role=checkbox rows (Lunch and Dinner ticked),
//                       an outlined time button on each, "At the table: ...", a secondary "Add another Meal Slot", "Set up by hand" and "Create 2 Meal Slots" in the footer,
//                       no Cancel, labels on one line, nothing wider than the sheet.
//   first-run-compact   / at 375, 390, 834: the first plan exists with 2 Recipes: the compact tile after the hero (when a hero shows), no steps list, the Recipes sentence, "Add a Recipe"
//                       and "Hide for now" (secondary, no icon on Hide). Hide for now hides it and toasts "Setup checklist hidden" with Undo; Undo brings the tile back.
import { evaluate, js, press, until } from '../helpers.mjs'

/** Page code, run before the app: the stub described above, for the given state. */
const stubSource = (state) => `(() => {
  const state = ${JSON.stringify(state)}
  window.__firstRun = { saved: [], state }
  const orig = window.fetch.bind(window)
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } })
  const pathOf = (input) => (typeof input === 'string' ? input : input.url).replace(location.origin, '')
  window.fetch = async (input, init) => {
    const path = pathOf(input)
    const method = ((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase()
    if (path === '/api/household/settings' && (method === 'GET' || method === 'PUT')) {
      if (method === 'PUT') {
        const body = JSON.parse(init.body)
        window.__firstRun.saved.push(body)
        Object.assign(state.settings, body, { timeZoneConfigured: true })
      }
      const real = await (await orig(input.url ? input : path)).json().catch(() => ({}))
      return json({ ...real, ...state.settings })
    }
    if (method === 'GET') {
      if (path === '/api/members' && state.members) return json(state.members)
      if (path === '/api/meal-slots' && state.slots) return json(state.slots)
      if (path === '/api/recipes' && state.recipes) return json(state.recipes)
      if (path === '/api/plan' && state.emptyPlan) {
        const real = await (await orig(path)).json()
        return json({ ...real, slots: [] })
      }
    }
    return orig(input, init)
  }
})()`

const withStub = (state) => [{ method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: stubSource(state) } }]

const NEW = { settings: { timeZone: 'UTC', timeZoneConfigured: false, currency: 'USD', setupHidden: false }, members: [], slots: [], recipes: [], emptyPlan: true }
const ZONE_DONE = { ...NEW, settings: { ...NEW.settings, timeZone: 'Europe/Rome', timeZoneConfigured: true, currency: 'EUR' } }
const MEMBER = (id, name) => ({ id, name, colour: '#3366cc', avatar: '', portionFactor: 1, userId: null, email: null })
const WITH_MEMBERS = { ...ZONE_DONE, members: [MEMBER(1, 'Anna'), MEMBER(2, 'Ben'), MEMBER(3, 'Chiara')] }
// the first plan exists: the real plan and Meal Slots of the seed, two Recipes, the zone confirmed
const COMPACT = { settings: { timeZoneConfigured: true, setupHidden: false }, recipes: [{ id: 1 }, { id: 2 }] }

const TILE = `document.querySelector('[data-tile="setup"] section.tile')`
const READY = `!!${TILE} && !document.querySelector('[aria-busy="true"], .skeleton')`

const fail = (what, list) => {
  if (list.length) throw new Error(`setup: not inspected: ${what}: ${js(list)}`)
}

/** Page code: the problems of the full tile (steps, current step, facts, controls). */
const CHECK_FULL = `(() => {
  const bad = []
  const tile = ${TILE}
  if (!tile) return ['no setup tile']
  const slots = [...document.querySelectorAll('.today [data-tile]')].map((e) => e.dataset.tile)
  const at = slots.indexOf('setup')
  if (at > 1 || (at === 1 && slots[0] !== 'shopping')) bad.push('the setup tile is not first (or second after Shopping): ' + slots.join(','))
  const steps = [...tile.querySelectorAll('ol > li')]
  if (steps.length !== 5) bad.push('the steps are ' + steps.length + ' rows in an ol, not 5')
  const current = steps.filter((li) => li.getAttribute('aria-current') === 'step')
  if (current.length !== 1) bad.push(current.length + ' steps are aria-current')
  if (steps.some((li) => !li.dataset.state)) bad.push('a step has no data-state')
  const bar = tile.querySelector('[role=progressbar]')
  if (!bar || bar.getAttribute('aria-valuemax') !== '5') bad.push('no progress bar of 5')
  if (tile.querySelectorAll('.tile-header').length !== 1) bad.push('the tile has ' + tile.querySelectorAll('.tile-header').length + ' headers')
  const links = [...tile.querySelectorAll('a[href]')]
  if (links.length) bad.push('the tile links to ' + links.map((a) => a.getAttribute('href')).join(', '))
  if (tile.querySelector('[data-variant="tertiary"], [data-variant="danger-tertiary"]')) bad.push('a tertiary button in the tile')
  const names = [...tile.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim().replace(/\\s+/g, ' '))
  if (new Set(names).size !== names.length) bad.push('two buttons share a name: ' + names.join(' | '))
  const later = steps.filter((li) => li.dataset.state === 'todo').flatMap((li) => [...li.querySelectorAll('button')])
  if (later.length) bad.push('a muted step has ' + later.length + ' buttons')
  if (tile.scrollWidth > tile.clientWidth + 1) bad.push('the tile is wider than itself (' + tile.scrollWidth + ' > ' + tile.clientWidth + ')')
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways')
  for (const t of tile.querySelectorAll('.setup-step__label, .setup-step__sub')) if (t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow === 'ellipsis') bad.push('"' + t.textContent.trim().slice(0, 30) + '" is cut with an ellipsis')
  return bad
})()`

/** Page code: the problems of the facts of step 1. */
const CHECK_FACTS = `(() => {
  const bad = []
  const list = document.querySelector('[data-tile="setup"] ul[aria-label="Detected settings"]')
  if (!list) return ['no "Detected settings" ul']
  const rows = [...list.children]
  if (rows.length !== 2) bad.push(rows.length + ' fact rows, not 2')
  for (const li of rows) {
    const key = li.querySelector('.setup-fact__key'), state = li.querySelector('.setup-fact__state'), detail = li.querySelector('.setup-fact__detail')
    const change = li.querySelector('button[aria-label^="Change "]')
    if (!key || !state || !detail || !change) { bad.push('a fact row lacks its key, state, detail or Change'); continue }
    const lh = parseFloat(getComputedStyle(detail).lineHeight) || 16
    const d = detail.getBoundingClientRect()
    if (d.height > lh * 1.6) bad.push('"' + detail.textContent.trim() + '" wraps (' + Math.round(d.height) + ' px high)')
    const c = change.getBoundingClientRect()
    if (!(c.top < d.bottom && c.bottom > d.top)) bad.push('Change is not on the detail line of ' + key.textContent.trim())
    if (c.left < d.right - 1 && Math.abs(c.top - d.top) > lh) bad.push('Change is under the detail of ' + key.textContent.trim())
    if (key.getBoundingClientRect().top > state.getBoundingClientRect().bottom) bad.push('the state of ' + key.textContent.trim() + ' is not beside its key')
  }
  const looks = [...document.querySelectorAll('[data-tile="setup"] button')].filter((b) => b.dataset.variant === 'primary')
  if (looks.length !== 1 || looks[0].textContent.trim() !== 'Looks right') bad.push('the one primary is not "Looks right"')
  return bad
})()`

/** Page code: problems of the open sheet (caption, Close, no Cancel, one-line footer labels, inside the viewport). */
const CHECK_SHEET = (labels) => `(() => {
  const bad = []
  const dlg = document.querySelector('dialog[open]')
  if (!dlg) return ['no open sheet']
  if (![...dlg.querySelectorAll('button')].some((b) => /^Close/.test(b.getAttribute('aria-label') || b.textContent.trim()))) bad.push('no circular Close')
  if ([...dlg.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel')) bad.push('a Cancel in the footer')
  const footer = dlg.querySelector('.sheet__footer')
  if (!footer) return bad.concat('no footer')
  const fb = [...footer.querySelectorAll('button')]
  const got = fb.map((b) => b.textContent.trim())
  if (JSON.stringify(got) !== JSON.stringify(${js(labels)})) bad.push('the footer buttons are ' + got.join(' | ') + ', want ' + ${js(labels.join(' | '))})
  for (const b of fb) {
    const r = document.createRange(); r.selectNodeContents(b)
    const tops = new Set([...r.getClientRects()].map((x) => Math.round(x.top)))
    if (tops.size > 1) bad.push('"' + b.textContent.trim() + '" wraps onto ' + tops.size + ' lines')
    const br = b.getBoundingClientRect()
    if (br.right > innerWidth + 0.5 || br.left < -0.5 || br.bottom > innerHeight + 0.5) bad.push('"' + b.textContent.trim() + '" is outside the viewport')
  }
  if (dlg.scrollWidth > dlg.clientWidth + 1) bad.push('the sheet is wider than itself')
  return bad
})()`

async function firstRunZone() {
  await until(READY, 'the setup tile')
  fail('the checklist', await evaluate(CHECK_FULL))
  fail('the time zone and currency rows', await evaluate(CHECK_FACTS))
  await press(`[...${TILE}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Looks right')`, 'the Looks right button')
  await until(`window.__firstRun.saved.length === 1`, 'the settings save')
  const saved = await evaluate(`window.__firstRun.saved[0]`)
  if (!saved.timeZone || !saved.currency) throw new Error(`setup: not inspected: Looks right saved ${js(saved)}`)
  await until(`document.activeElement && document.activeElement.textContent.trim() === 'Add a Member'`, 'focus on Add a Member')
  const said = await evaluate(`(${TILE}.querySelector('[role=status]') || {}).textContent || ''`)
  if (!/Step 1 of 5 done\./.test(said)) throw new Error(`setup: not inspected: the status says "${said}", not "Step 1 of 5 done."`)
}

async function firstRunMember() {
  await until(READY, 'the setup tile')
  const here = await evaluate(`location.pathname`)
  await press(`[...${TILE}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add a Member')`, 'the Add a Member button')
  await until(`!!document.querySelector('dialog[open]')`, 'the Member sheet')
  if ((await evaluate(`location.pathname`)) !== here) throw new Error('setup: not inspected: Add a Member left Today')
  if (!(await evaluate(`/Set up · step 2 of 5 · no Members yet/.test(document.querySelector('dialog[open]').textContent)`))) throw new Error('setup: not inspected: the sheet has no caption "Set up · step 2 of 5 · no Members yet"')
  fail('the Member sheet', await evaluate(CHECK_SHEET(['Save and add another', 'Save'])))
}

async function firstRunSlots() {
  await until(READY, 'the setup tile')
  await press(`[...${TILE}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Set up Meal Slots')`, 'the Set up Meal Slots button')
  await until(`!!document.querySelector('dialog[open]')`, 'the Meal Slot quick start')
  const bad = await evaluate(`(() => {
    const dlg = document.querySelector('dialog[open]'), bad = []
    if (!/When do you eat\\?/.test(dlg.textContent)) bad.push('the sheet is not "When do you eat?"')
    const rows = [...dlg.querySelectorAll('[role=checkbox]')]
    if (rows.length !== 3) bad.push(rows.length + ' checkbox rows, not 3')
    const on = rows.filter((r) => r.getAttribute('aria-checked') === 'true' || r.checked === true).map((r) => (r.getAttribute('aria-label') || r.textContent).trim().split(/[ ,]/)[0])
    if (JSON.stringify(on) !== JSON.stringify(['Lunch', 'Dinner'])) bad.push('ticked: ' + on.join(',') + ', want Lunch,Dinner')
    for (const n of ['Breakfast', 'Lunch', 'Dinner']) if (!dlg.querySelector('button[aria-label^="' + n + ' time"]')) bad.push('no time button for ' + n)
    if (!/At the table: Anna, Ben, Chiara/.test(dlg.textContent)) bad.push('no "At the table: Anna, Ben, Chiara"')
    const add = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add another Meal Slot')
    if (!add || add.dataset.variant !== 'secondary') bad.push('no secondary "Add another Meal Slot"')
    for (const r of rows) if (r.getBoundingClientRect().height < 43.5) bad.push('a checkbox row is ' + Math.round(r.getBoundingClientRect().height) + ' px tall')
    return bad
  })()`)
  fail('the Meal Slot quick start', bad)
  fail('the Meal Slot quick start footer', await evaluate(CHECK_SHEET(['Set up by hand', 'Create 2 Meal Slots'])))
}

async function firstRunCompact() {
  await until(READY, 'the setup tile')
  const bad = await evaluate(`(() => {
    const tile = ${TILE}, bad = []
    if (!tile.classList.contains('setup-tile--compact')) bad.push('the tile is not compact')
    if (tile.querySelector('ol')) bad.push('a compact tile lists steps')
    if (!/Add 3 more Recipes and the planner has more to choose from\\. 2 of 5 so far\\./.test(tile.textContent)) bad.push('the sentence is "' + tile.textContent.replace(/\\s+/g, ' ').slice(0, 160) + '"')
    const names = [...tile.querySelectorAll('button')].map((b) => b.textContent.trim())
    if (JSON.stringify(names) !== JSON.stringify(['Add a Recipe', 'Hide for now'])) bad.push('buttons: ' + names.join(' | '))
    const hide = [...tile.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hide for now')
    if (hide && (hide.dataset.variant !== 'secondary' || hide.querySelector('svg'))) bad.push('Hide for now is not a plain secondary')
    const order = [...document.querySelectorAll('.today [data-tile]')].map((e) => e.dataset.tile)
    if (order.includes('nextMeal') && order.indexOf('setup') < order.indexOf('nextMeal')) bad.push('the compact tile is before the hero: ' + order.join(','))
    if (tile.querySelectorAll('.tile-header').length !== 1) bad.push('not one header')
    return bad
  })()`)
  fail('the compact checklist', bad)
  await press(`[...${TILE}.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hide for now')`, 'the Hide for now button')
  await until(`!document.querySelector('[data-tile="setup"] section.tile') && [...document.querySelectorAll('.toast')].some((t) => /Setup checklist hidden/.test(t.textContent))`, 'the tile gone and the toast')
  const undo = await evaluate(`(() => { const t = [...document.querySelectorAll('.toast')].find((t) => /Setup checklist hidden/.test(t.textContent)); return t && [...t.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Undo') && !t.querySelector('svg') })()`)
  if (!undo) throw new Error('setup: not inspected: the toast has no Undo, or it has an icon')
  await press(`[...document.querySelectorAll('.toast button')].find((b) => b.textContent.trim() === 'Undo')`, 'the Undo button')
  await until(READY, 'the tile back after Undo')
}

const TILE_RULES = ['P1', 'P11', 'P13', 'P38']
const SHEET_RULES = ['P25', 'P33']

export default {
  order: 370,
  scenarios: [
    { name: 'first-run-zone', route: '/', start: '/', setup: 'firstRunZone', widths: [375, 390, 834], emulate: withStub(NEW), rules: TILE_RULES },
    { name: 'first-run-member', route: '/', start: '/', setup: 'firstRunMember', widths: [375, 390, '667x375'], emulate: withStub(ZONE_DONE), rules: SHEET_RULES },
    { name: 'first-run-slots', route: '/', start: '/', setup: 'firstRunSlots', widths: [375, 390, '667x375'], emulate: withStub(WITH_MEMBERS), rules: SHEET_RULES },
    { name: 'first-run-compact', route: '/', start: '/', setup: 'firstRunCompact', widths: [375, 390, 834], emulate: withStub(COMPACT), rules: TILE_RULES },
  ],
  setups: { firstRunZone, firstRunMember, firstRunSlots, firstRunCompact },
}
