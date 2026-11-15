// B9-26 (plan section 9; PC-01, SAFE-03, SAFE-07): the scenarios of What changed, Undo Not cooked and the Regenerate question.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so the scenario is "not
// inspected" (a failure) until the screens are built. They also bring the page to the state the probes measure.
//   plan-after-swap        /plan, 390 and 1440: Swap a Recipe until another meal changes. The toast has a headline, a subline and two
//                          bordered buttons (Review, Undo); a success toast has no status svg; every [data-changed] row has a "was" text.
//   regenerate             /plan, 390 and 1440: Regenerate opens its question with the outline Cancel focused.
//   to-confirm-not-cooked  /, 390 and 1440: Not cooked from a To confirm row's menu shows, within 500 ms, a .toast with Undo and no
//                          icon before its message. The Course it marked is reopened by the next setup, so the seed stays as it was.
import { evaluate, press, until } from '../helpers.mjs'

const PLAN_READY = `!!document.querySelector('main .plan article') && !document.querySelector('[aria-busy="true"], .skeleton')`
const TOAST = `document.querySelector('.toast')`
/** The Swap buttons of the day tiles after today (page code returning an array). */
const FUTURE_SWAPS = `[...document.querySelectorAll('main article')].filter((a) => !/Today/.test(a.querySelector('h2, h3')?.textContent ?? '')).flatMap((a) => [...a.querySelectorAll('button[aria-label^="Swap "]')])`
/** Courses the to-confirm-not-cooked setup marked Not cooked and has not reopened yet ({ date, mealSlotId, courseId }). */
let marked = []

async function reopenMarked() {
  const todo = marked
  marked = []
  for (const c of todo) {
    const ok = await evaluate(`fetch('/api/plan/${c.date}/${c.mealSlotId}/${c.courseId}/reopen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.ok)`)
    if (!ok) throw new Error(`setup: the Course ${c.date}/${c.mealSlotId}/${c.courseId} that to-confirm-not-cooked marked could not be reopened; the seed is left changed`)
  }
}

/** What the page shows, appended to a failed setup's message so a "did not show" says what did show instead. */
const SNAPSHOT = `JSON.stringify({
  path: location.pathname,
  toasts: [...document.querySelectorAll('.toast')].map((t) => t.innerText.replace(/\\s+/g, ' ')),
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\\s+/g, ' ').slice(0, 160)),
  menuItems: [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent.trim()),
  moreButtons: [...document.querySelectorAll('button[aria-label^="More for "]')].map((e) => e.getAttribute('aria-label')),
  alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.innerText.replace(/\\s+/g, ' ').slice(0, 120)),
  main: (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 300),
})`
async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    const seen = await evaluate(SNAPSHOT).catch(() => '?')
    throw new Error(`${e.message} [${seen}]`)
  }
}

async function planAfterSwap() {
  await until(PLAN_READY, 'the Plan')
  const tries = 14
  const trace = []
  for (let attempt = 0; attempt < tries; attempt++) {
    await evaluate(`document.querySelectorAll('.toast__dismiss').forEach((b) => b.click())`)
    // The Swap of a row on a later day, remembering the day: today's meals are past their slot time on the guard's real clock
    // ("That day is already over"). The day tile's heading is "Tue 17"; the plan view says which date that is.
    const opened = await evaluate(`(async () => {
      const b = ${FUTURE_SWAPS}[${attempt}]
      if (!b) return false
      const heading = b.closest('article')?.querySelector('h2, h3')?.textContent.trim() ?? ''
      const view = await (await fetch('/api/plan')).json()
      const name = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + new Date(d + 'T00:00:00Z').getUTCDate()
      window.__b926SwapDay = view.slots.map((s) => s.date).find((d) => heading.startsWith(name(d))) ?? ''
      b.click()
      return true
    })()`)
    if (!opened) break
    // The sheet shows alternatives, or says no other Recipe fits ("Keep it").
    await until(`!!document.querySelector('dialog[open] [aria-label="Alternatives"] button') || [...document.querySelectorAll('dialog[open] button')].some((b) => b.textContent.trim() === 'Keep it')`, 'the Swap sheet')
    // Swap to a Recipe the plan has on a later day: that later meal is replanned (B9-11, Cool-down), so there is something to say (PC-01).
    const seen = await evaluate(`(async () => {
      const view = await (await fetch('/api/plan')).json()
      const from = window.__b926SwapDay
      const later = new Set(view.slots.filter((s) => from && s.date > from).flatMap((s) => (s.courses ?? []).map((c) => c.meal?.recipeName).filter(Boolean)))
      const buttons = [...document.querySelectorAll('dialog[open] [aria-label="Alternatives"] button')]
      const nameOf = (b) => b.getAttribute('aria-label') ?? b.textContent.trim()
      const hit = buttons.find((b) => [...later].some((n) => nameOf(b).includes(n)))
      const info = { from, alternatives: buttons.map((b) => nameOf(b).slice(0, 40)), later: [...later].map((n) => n.slice(0, 30)) }
      if (hit) hit.click()
      return JSON.stringify({ ...info, picked: !!hit })
    })()`)
    trace.push(seen)
    const picked = JSON.parse(seen).picked
    if (!picked) {
      await press(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Keep it')`, '"Keep it"')
      await until(`!document.querySelector('dialog[open]')`, 'the Swap sheet to close')
      continue
    }
    await until(`!!${TOAST}`, 'the Swap toast', 4000)
    if (await evaluate(`!!${TOAST}?.querySelector('button[aria-label^="Review"]')`)) {
      const finding = await evaluate(`(() => {
        const t = ${TOAST}
        const actions = [...t.querySelectorAll('.toast__action')]
        if (!t.querySelector('.toast__title')?.textContent.trim()) return 'the toast has no headline'
        if (!t.querySelector('.toast__subline')?.textContent.trim()) return 'the toast has no subline'
        // A toast action draws its boundary as a 1 px inset ring (box-shadow, R-A; ui/Toast.css), or a border: either is a bordered button.
        const bordered = (a) => parseFloat(getComputedStyle(a).borderTopWidth) > 0 || /inset/.test(getComputedStyle(a).boxShadow)
        if (actions.length < 2 || !actions.every(bordered)) return 'the toast does not have two bordered buttons (Review, Undo)'
        if (t.querySelector('.toast__title svg')) return 'a success toast carries a status svg'
        const rows = [...document.querySelectorAll('[data-changed]')]
        if (rows.length === 0) return 'no row is marked data-changed'
        const bare = rows.filter((r) => !r.querySelector('.plan-row__was')?.textContent.trim())
        if (bare.length) return bare.length + ' [data-changed] row(s) have no "was" text'
        return ''
      })()`)
      if (finding) throw new Error(`setup: not inspected: ${finding}`)
      return
    }
  }
  throw new Error(`setup: not inspected: no Swap to a Recipe planned later changed another meal, so there is no What changed toast to inspect (or the toast has no Review). Tried: ${trace.join(' ')}`)
}

async function regenerate() {
  await until(PLAN_READY, 'the Plan')
  await press(`[...document.querySelectorAll('main .page-header button, main header button')].find((b) => b.textContent.trim() === 'Regenerate')`, '"Regenerate"')
  await until(`!!document.querySelector('dialog[open]') && /Regenerate the plan\\?/.test(document.querySelector('dialog[open]').textContent)`, 'the Regenerate question')
  await until(`document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.trim() === 'Cancel' && !!document.activeElement.closest('dialog[open]')`, 'the focus on Cancel (Enter must not regenerate)', 2500)
}

async function toConfirmNotCooked() {
  await reopenMarked()
  await until(`!!document.querySelector('main .bento-grid') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Today grid')
  const target = await evaluate(`(async () => {
    const r = await fetch('/api/plan/to-confirm'); if (!r.ok) return null
    const first = ((await r.json()).slots ?? []).find((x) => x.courseId != null)
    return first ? { date: first.date, mealSlotId: first.mealSlotId, courseId: first.courseId } : null
  })()`)
  if (!target) throw new Error('setup: not inspected: the seed has nothing to confirm (no To confirm row)')
  // the ⋮ of the first row of the To confirm tile (the hero's own Course rows have one too); a phone shows the menu as a sheet
  const TO_CONFIRM_MORE = `(() => { const h = [...document.querySelectorAll('main h2, main h3')].find((e) => e.textContent.trim() === 'To confirm'); return h?.closest('section, article, [data-tile]')?.querySelector('button[aria-label^="More for "]') })()`
  await press(TO_CONFIRM_MORE, 'the ⋮ of a To confirm row')
  // the item is a menu item on a tablet and desktop and a row of the Menu sheet on a phone: the leaf that says "Not cooked", and its
  // target. A ListRow's target is the stretched button BESIDE the title (not an ancestor), so the row's own button is pressed, not the li.
  const NOT_COOKED = `([...document.querySelectorAll('[role="menuitem"]')].filter((e) => e.textContent.trim() === 'Not cooked')[0] ?? [...document.querySelectorAll('dialog[open] *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Not cooked').map((e) => e.closest('button, a') ?? e.closest('li')?.querySelector('button, a') ?? e.closest('[tabindex]') ?? e)[0])`
  await until(`!!(${NOT_COOKED})`, 'the Not cooked menu item')
  await press(NOT_COOKED, '"Not cooked"')
  marked.push(target)
  await until(`!!${TOAST}`, 'a toast within 500 ms of Not cooked', 500)
  const finding = await evaluate(`(() => {
    const t = ${TOAST}
    if (![...t.querySelectorAll('button')].some((b) => /^Undo/.test(b.getAttribute('aria-label') ?? b.textContent.trim()))) return 'the toast has no Undo'
    if (t.querySelector('.toast__title svg')) return 'an icon precedes the message'
    return ''
  })()`)
  if (finding) throw new Error(`setup: not inspected: ${finding}`)
}

export default {
  order: 326,
  scenarios: [
    { name: 'plan-after-swap', route: '/plan', start: '/plan', setup: 'planAfterSwap', widths: [390, 1440] },
    { name: 'regenerate', route: '/plan', start: '/plan', setup: 'regenerate', widths: [390, 1440] },
    { name: 'to-confirm-not-cooked', route: '/', start: '/', setup: 'toConfirmNotCooked', widths: [390, 1440] },
  ],
  setups: {
    planAfterSwap: () => withSnapshot(planAfterSwap),
    regenerate: () => withSnapshot(regenerate),
    toConfirmNotCooked: () => withSnapshot(toConfirmNotCooked),
  },
}
