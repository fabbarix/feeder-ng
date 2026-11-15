// B9-26 (plan section 9; PC-01, SAFE-03, SAFE-07): the scenarios of What changed, Undo Not cooked and the Regenerate question.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so the scenario is "not
// inspected" (a failure) until the screens are built. They also bring the page to the state the probes measure.
//   plan-after-swap        /plan, 390 and 1440: Swap a Recipe until another meal changes. The toast has a headline, a subline and two
//                          bordered buttons (Review, Undo); a success toast has no status svg; every [data-changed] row has a "was" text.
//   regenerate             /plan, 390 and 1440: Regenerate opens its question with the outline Cancel focused.
//   to-confirm-not-cooked  /, 390 and 1440: Not cooked from a To confirm row's menu shows, within 500 ms, a .toast with Undo and no
//                          icon before its message. The Course it marked is reopened by the next setup, so the seed stays as it was.
import { byText, evaluate, press, until } from '../helpers.mjs'

const PLAN_READY = `!!document.querySelector('main .plan article') && !document.querySelector('[aria-busy="true"], .skeleton')`
const TOAST = `document.querySelector('.toast')`
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

async function planAfterSwap() {
  await until(PLAN_READY, 'the Plan')
  const tries = 6
  for (let attempt = 0; attempt < tries; attempt++) {
    await evaluate(`document.querySelectorAll('.toast__dismiss').forEach((b) => b.click())`)
    if (!(await evaluate(`(() => { const b = document.querySelectorAll('main button[aria-label="Swap"]')[${attempt}]; if (!b) return false; b.click(); return true })()`))) break
    await until(`!!document.querySelector('dialog.sheet[open] [aria-label="Alternatives"] button')`, 'the alternatives of the Swap sheet')
    if (!(await evaluate(`(() => { const l = document.querySelectorAll('dialog.sheet[open] [aria-label="Alternatives"] button'); const b = l[${attempt} % l.length]; if (!b) return false; b.click(); return true })()`))) break
    await until(`!!${TOAST}`, 'the Swap toast', 4000)
    if (await evaluate(`!!${TOAST}?.querySelector('button[aria-label^="Review"]')`)) {
      const finding = await evaluate(`(() => {
        const t = ${TOAST}
        const actions = [...t.querySelectorAll('.toast__action')]
        if (!t.querySelector('.toast__title')?.textContent.trim()) return 'the toast has no headline'
        if (!t.querySelector('.toast__subline')?.textContent.trim()) return 'the toast has no subline'
        if (actions.length < 2 || !actions.every((a) => parseFloat(getComputedStyle(a).borderTopWidth) > 0)) return 'the toast does not have two bordered buttons (Review, Undo)'
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
  throw new Error('setup: not inspected: none of the Swaps changed another meal, so there is no What changed toast to inspect')
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
  await press(`document.querySelector('main button[aria-label^="More for "]')`, 'the ⋮ of a To confirm row')
  await until(`[...document.querySelectorAll('[role="menuitem"]')].some((e) => e.textContent.trim() === 'Not cooked')`, 'the Not cooked menu item')
  await press(byText('[role="menuitem"]', 'Not cooked'), '"Not cooked"')
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
  setups: { planAfterSwap, regenerate, toConfirmNotCooked },
}
