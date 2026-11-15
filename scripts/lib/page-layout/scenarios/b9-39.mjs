// B9-39 (plan sections 6 and 9; TB-01, TB-10, TB-15b, A2, the user's bug report on the hero's ⋮): the Today hero on a real screen.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so a scenario is "not inspected" (a failure)
// until the hero is built. P38 (unique names, A11Y-08) runs on both: the bridge `P38@/ = warn until B9-39` (modes.d/40-b9-32-p38-warn) is deleted with this package.
//   today-after-lunch  / at 375, 390 and 1440, with the page's clock moved to 44 minutes after a Meal Slot of today that has a Planned Meal (the chapter's
//                      "clock at 14:44": Lunch 13:00 has gone), another planned meal still ahead:
//                      - the hero's eyebrow starts with the NEXT slot's name, never "Today", and is a row of parts that never break inside and never end a line in "·"
//                        (TB-15b); the hero is named by its Recipe (a region);
//                      - the ⋮ shares row 1 with the eyebrow, the Recipe name starts below it and nothing of the ⋮ overlaps the name (the user's report);
//                      - the slot that has gone is the FIRST row of To confirm, and no two buttons of the page share a name (P38);
//                      - the hero's name and its why chips are buttons (TB-10), the chips with a 44 px high hit area.
//   today-after-swap   / at 390 and 1440: Swap the hero from its ⋮, choose an Alternative: the "Swapped" toast has a headline and Undo, no icon before the message, the hero
//                      shows the new Recipe (Today after a Swap, never seen on a real screen before). The swap is undone by the next run's setup (best effort).
import { evaluate, press, until } from '../helpers.mjs'

const READY = `!!document.querySelector('main .bento-grid') && !document.querySelector('[aria-busy="true"], .skeleton')`
const TOAST = `document.querySelector('.toast')`

/**
 * Runs before the page's own scripts (Page.addScriptToEvaluateOnNewDocument): reads today's plan synchronously, picks a planned slot A of today that
 * has gone by 44 minutes at the new clock while another planned slot B is still ahead, and moves Date by the difference. The result is in
 * window.__b939 ({ a, b, at } or { error }).
 */
const CLOCK = `(() => {
  const RealDate = Date
  const fail = (error) => { window.__b939 = { error } }
  try {
    const x = new XMLHttpRequest()
    x.open('GET', '/api/plan', false)
    x.send()
    if (x.status !== 200) return fail('GET /api/plan answered ' + x.status)
    const view = JSON.parse(x.responseText)
    const planned = (s) => (s.courses ?? []).some((c) => c.meal && c.meal.state === 'planned')
    const slots = view.slots.filter(planned).sort((p, q) => RealDate.parse(p.at) - RealDate.parse(q.at))
    // The chapter's case first: the next slot is on the same day (Lunch gone, Dinner ahead). Only when the seed has no such pair at this hour
    // is the next slot on a later day, and then the eyebrow rightly leads with its day word ("Tomorrow · Breakfast").
    const pairs = slots.filter((s) => s.date === view.today).map((a) => {
      const target = RealDate.parse(a.at) + 44 * 60000
      return { a, target, b: slots.find((s) => RealDate.parse(s.at) > target) }
    }).filter((p) => p.b)
    const pick = pairs.find((p) => p.b.date === p.a.date) ?? pairs[0]
    for (const { a, b, target } of pick ? [pick] : []) {
      const offset = target - RealDate.now()
      class FakeDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(RealDate.now() + offset); else super(...args) }
        static now() { return RealDate.now() + offset }
      }
      window.Date = FakeDate
      window.__b939 = { a: a.name, aRecipe: a.courses.find((c) => c.meal)?.meal.recipeName, b: b.name, bRecipe: b.courses.find((c) => c.meal)?.meal.recipeName, sameDay: b.date === a.date, at: new RealDate(target).toISOString() }
      return
    }
    fail('the seed has no planned slot of ' + view.today + ' with another planned slot after it')
  } catch (e) {
    fail(String(e))
  }
})()`

const SNAPSHOT = `JSON.stringify({
  clock: window.__b939,
  eyebrow: [...document.querySelectorAll('.plan-hero .tile__overline > *')].map((e) => e.textContent.trim()).slice(0, 6),
  hero: document.querySelector('.plan-hero h2')?.textContent,
  toConfirm: [...document.querySelectorAll('.to-confirm__row')].map((r) => r.innerText.replace(/\\s+/g, ' ').slice(0, 50)).slice(0, 4),
  main: (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
})`
async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    const seen = await evaluate(SNAPSHOT).catch(() => '?')
    throw new Error(`${e.message} [${seen}]`)
  }
}

async function todayAfterLunch() {
  await until(READY, 'Today')
  await withSnapshot(async () => {
    const finding = await evaluate(`(() => {
      const clock = window.__b939
      if (!clock || clock.error) return 'the page clock could not be moved: ' + (clock?.error ?? 'the clock script did not run')
      const hero = document.querySelector('.plan-hero')
      if (!hero) return 'Today has no hero (.plan-hero)'
      const parts = [...hero.querySelectorAll('.tile__overline .plan-hero__eyebrow-part')]
      if (parts.length === 0) return 'the eyebrow has no .plan-hero__eyebrow-part (TB-15b)'
      // a today slot has no day word on Today; a slot of a later day leads with its day word, then "· <slot>"
      const slotPart = clock.sameDay ? parts[0]?.textContent.trim() : parts[1]?.textContent.trim().replace(/^·\\s*/, '')
      if (slotPart !== clock.b) return 'the hero\\'s eyebrow is "' + parts.map((p) => p.textContent.trim()).join(' ') + '", not the next slot "' + clock.b + '"' + (clock.sameDay ? ' first' : ' after its day word') + ' (TB-01: the hero moves on at the slot time, and a today slot has no "Today" word)'
      if (parts.some((p) => p.textContent.trim() === 'Today')) return 'the eyebrow says "Today" on Today'
      for (const p of parts.slice(1)) if (!p.textContent.trim().startsWith('·')) return 'the eyebrow part "' + p.textContent.trim() + '" does not start with its separator'
      for (const p of parts) {
        const cs = getComputedStyle(p)
        if (cs.whiteSpace !== 'nowrap') return 'the eyebrow part "' + p.textContent.trim() + '" can wrap inside itself (white-space ' + cs.whiteSpace + ')'
        const r = document.createRange(); r.selectNodeContents(p)
        const lines = new Set([...r.getClientRects()].map((q) => Math.round(q.top / 4)))
        if (lines.size > 1) return 'the eyebrow part "' + p.textContent.trim() + '" is broken over ' + lines.size + ' lines'
      }
      // the region named by its Recipe
      const name = hero.querySelector('h2')
      if (!name) return 'the hero has no h2'
      if (hero.getAttribute('aria-labelledby') !== name.id || !name.id) return 'the hero is not named by its Recipe (aria-labelledby the h2)'
      // the user's report: the eyebrow and the ⋮ share row 1, the name starts below, nothing overlaps
      const menu = hero.querySelector('.plan-hero__menu button')
      if (!menu) return 'the hero has no ⋮ menu button'
      const eyebrow = hero.querySelector('.tile__overline').getBoundingClientRect()
      const m = menu.getBoundingClientRect()
      const t = name.getBoundingClientRect()
      if (Math.abs((m.top + m.bottom) / 2 - (eyebrow.top + eyebrow.bottom) / 2) > 12) return 'the ⋮ is not on the eyebrow\\'s row (centres ' + Math.round((m.top + m.bottom) / 2) + ' and ' + Math.round((eyebrow.top + eyebrow.bottom) / 2) + ')'
      if (m.bottom > t.top + 1) return 'the ⋮ (bottom ' + Math.round(m.bottom) + ') reaches the Recipe name (top ' + Math.round(t.top) + '): the name must start below row 1'
      const overlap = !(m.right <= t.left || m.left >= t.right || m.bottom <= t.top || m.top >= t.bottom)
      if (overlap) return 'the ⋮ overlaps the Recipe name'
      // TB-10: the name and the why chips are buttons, the chips with a hit area 44 px high
      if (!name.querySelector('button')) return 'the Recipe name is not a button (TB-10)'
      const chips = [...hero.querySelectorAll('.plan-hero__chips .chip[data-kind="why"]')]
      for (const c of chips) {
        if (c.tagName !== 'BUTTON') return 'the why chip "' + c.textContent.trim() + '" is not a button (TB-10)'
        const after = getComputedStyle(c, '::after')
        const h = parseFloat(after.height)
        if (!(h >= 44 - 1)) return 'the why chip "' + c.textContent.trim() + '" has a hit area of ' + Math.round(h) + ' px, under 44 px (the ::after overlay)'
      }
      // the slot that has gone is the first row of To confirm
      const row = document.querySelector('.to-confirm__row')
      if (!row) return 'To confirm has no row: ' + clock.a + ' (' + clock.aRecipe + ') should be its first row'
      if (!row.textContent.includes(clock.a) || !row.textContent.includes(clock.aRecipe)) return 'the first To confirm row is "' + row.innerText.replace(/\\s+/g, ' ').slice(0, 60) + '", not ' + clock.a + ' (' + clock.aRecipe + ')'
      // A11Y-08 on Today: no two visible buttons share a name (P38 measures it too)
      const names = new Map()
      for (const b of document.querySelectorAll('main button')) {
        if (!b.getClientRects().length) continue
        const n = (b.getAttribute('aria-label') ?? b.textContent).replace(/\\s+/g, ' ').trim()
        if (n) names.set(n, (names.get(n) ?? 0) + 1)
      }
      const dup = [...names].filter(([, c]) => c > 1).map(([n]) => n)
      if (dup.length) return 'buttons share a name: ' + dup.slice(0, 4).join(' | ')
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
  })
}

/** The token of the last Swap, read back from the page (its fetch is wrapped), and what it replaced. */
let pending = null

async function undoPendingSwap() {
  if (!pending) return
  const { token, key, recipeId } = pending
  pending = null
  const post = (path, body) => evaluate(`fetch(${JSON.stringify(path)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).then((r) => r.ok)`)
  if (token && (await post('/api/plan/restore', { undoToken: token }))) return
  // the plan moved on since: put the Recipe back, then unpin
  await evaluate(`fetch('/api/plan/${key}', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ recipeId }))} }).then((r) => r.ok)`)
  await post(`/api/plan/${key}/unpin`, {})
}

async function todayAfterSwap() {
  await undoPendingSwap()
  await until(READY, 'Today')
  await withSnapshot(async () => {
    const before = await evaluate(`document.querySelector('.plan-hero h2')?.textContent.trim() ?? ''`)
    if (!before) throw new Error('setup: not inspected: Today has no hero to swap')
    // remember what the Swap replaces (for the next run's undo) and read its token from the PUT's answer
    await evaluate(`(() => {
      const real = window.fetch
      window.__b939Swap = { token: null }
      window.fetch = async (input, init) => {
        const res = await real(input, init)
        const url = typeof input === 'string' ? input : input.url
        if (init?.method === 'PUT' && /\\/api\\/plan\\/[^/]+\\/\\d+\\/\\d+$/.test(url)) {
          const copy = res.clone()
          copy.json().then((j) => { window.__b939Swap = { token: j.undoToken ?? null, key: url.replace(/^.*\\/api\\/plan\\//, '') } }).catch(() => {})
        }
        return res
      }
    })()`)
    const original = await evaluate(`fetch('/api/plan').then((r) => r.json()).then((v) => { const s = v.slots.find((x) => x.courses?.some((c) => c.meal?.recipeName === ${JSON.stringify(before)})); const c = s?.courses.find((x) => x.meal?.recipeName === ${JSON.stringify(before)}); return c ? { key: s.date + '/' + s.mealSlotId + '/' + c.courseId, recipeId: c.meal.recipeId } : null })`)
    // the ⋮ of the hero ("<Slot> actions"), then its Swap item: a menu item on a tablet and desktop, a row of the Menu sheet on a phone
    await press(`document.querySelector('.plan-hero .plan-hero__menu button')`, 'the ⋮ of the hero')
    const SWAP = `([...document.querySelectorAll('[role="menuitem"]')].filter((e) => e.textContent.trim() === 'Swap')[0] ?? [...document.querySelectorAll('dialog[open] *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Swap').map((e) => e.closest('button, a') ?? e.closest('li')?.querySelector('button, a') ?? e)[0])`
    await until(`!!(${SWAP})`, 'the Swap item of the hero menu (TB-10)')
    await press(SWAP, '"Swap"')
    await until(`!!document.querySelector('dialog[open] [aria-label="Instead"] button')`, 'the Instead list of the Swap sheet')
    await press(`document.querySelector('dialog[open] [aria-label="Instead"] button')`, 'the first Alternative')
    await until(`!!${TOAST}`, 'the Swap toast', 5000)
    const finding = await evaluate(`(() => {
      const t = ${TOAST}
      if (!/^Swapped/.test(t.querySelector('.toast__title')?.textContent.trim() ?? '')) return 'the toast does not start "Swapped": ' + t.innerText.replace(/\\s+/g, ' ').slice(0, 80)
      if (![...t.querySelectorAll('button')].some((b) => /^Undo/.test(b.getAttribute('aria-label') ?? b.textContent.trim()))) return 'the toast has no Undo'
      if (t.querySelector('.toast__title svg')) return 'an icon precedes the message'
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
    await until(`(document.querySelector('.plan-hero h2')?.textContent.trim() ?? '') !== ${JSON.stringify(before)} || !document.querySelector('.plan-hero')`, 'the hero to show the new Recipe (or to move on)', 5000)
    const swap = await evaluate('window.__b939Swap')
    pending = original ? { token: swap?.token ?? null, key: original.key, recipeId: original.recipeId } : null
  })
}

export default {
  order: 336,
  // fast-checks: a unit starts on a fresh copy of the seeded database, so what an earlier unit's setups did there is gone: forget it.
  reset() {
    pending = null
  },
  scenarios: [
    {
      name: 'today-after-lunch',
      route: '/',
      start: '/',
      widths: [375, 390, 1440],
      emulate: [{ method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: CLOCK } }],
      setup: 'todayAfterLunch',
      rules: ['P1', 'P11', 'P13', 'P14', 'P17', 'P18', 'P24', 'P38', 'P39'],
    },
    { name: 'today-after-swap', route: '/', start: '/', widths: [390, 1440], setup: 'todayAfterSwap', rules: ['P1', 'P11', 'P13', 'P14', 'P17', 'P18', 'P29', 'P38', 'P39'] },
  ],
  setups: {
    todayAfterLunch: () => todayAfterLunch(),
    todayAfterSwap: () => todayAfterSwap(),
  },
}
