// B9-45 (plan section 9; PC-02, PC-05, PC-13): the scenarios of the Cooked moment, Get ready and the Freeze sheet.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so the scenario is "not inspected"
// (a failure) until the screens are built. No rule number: the setups measure and throw, as B9-25's and B9-40's do.
//   cooked-confirmation   Cook Mode of a meal still to confirm, 390 and 1440 (PC-02): after Mark as Cooked (or Mark all Cooked) the page is
//                         "Cooked, nice one!"; no [data-status="danger"] and no role alert inside .cook-confirmation; no li with free text
//                         (a bullet sentence) inside it; the shortfall rows, when there are any, are DetailList rows in ONE .shortfall-notice;
//                         the primary action is in the viewport. The next setup reopens the Course, so the seed stays as it was.
//   cook-get-ready        the same Cook Mode before the first Step, 390 and 1440 (PC-05): an article named "Get ready" is first, every row has a
//                         name, an amount at the end and, where Stock holds the Ingredient, its Storage Place in the row's meta; Start cooking
//                         is the primary and in the viewport; the Step is not on screen yet; no row's text is cut.
//   leftover-freeze-sheet Today, 390 (PC-13): Freeze it opens "How many portions to freeze?": exactly one primary button, no Close, no select
//                         showing (Change opens it), and the stepper is named "Portions to freeze".
import { evaluate, press, until } from '../helpers.mjs'

const noSkeleton = `!document.querySelector('[aria-busy="true"], .skeleton')`
/** Courses these setups marked Cooked and have not reopened yet ({ date, mealSlotId, courseId }). */
let marked = []

async function reopenMarked() {
  const todo = marked
  marked = []
  for (const c of todo) {
    const ok = await evaluate(`fetch('/api/plan/${c.date}/${c.mealSlotId}/${c.courseId}/reopen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.ok)`)
    if (!ok) throw new Error(`setup: the Course ${c.date}/${c.mealSlotId}/${c.courseId} that B9-45's setup marked Cooked could not be reopened; the seed is left changed`)
  }
}

const SNAPSHOT = `JSON.stringify({
  path: location.pathname,
  headings: [...document.querySelectorAll('h1, h2')].map((h) => h.textContent.trim()).slice(0, 6),
  buttons: [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()).slice(0, 14),
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\\s+/g, ' ').slice(0, 160)),
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

/** The first Course of To confirm: { date, mealSlotId, courseId } or throws. */
async function firstToConfirm() {
  const target = await evaluate(`(async () => {
    const r = await fetch('/api/plan/to-confirm'); if (!r.ok) return null
    const first = ((await r.json()).slots ?? []).find((x) => x.courseId != null)
    return first ? { date: first.date, mealSlotId: first.mealSlotId, courseId: first.courseId } : null
  })()`)
  if (!target) throw new Error('setup: not inspected: the seed has nothing to confirm (no To confirm row)')
  return target
}

const BUTTON = (text) => `[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim() === ${JSON.stringify(text)} && !b.disabled)`

async function openCookOfFirstToConfirm() {
  await reopenMarked()
  const target = await firstToConfirm()
  await evaluate(`location.assign('/cook/meal/${target.date}/${target.mealSlotId}')`)
  await until(`!!document.querySelector('main h1, .cook-screen h1') && ${noSkeleton}`, 'Cook Mode', 15000)
  return target
}

async function cookGetReady() {
  await openCookOfFirstToConfirm()
  await until(`!!document.querySelector('article[aria-label="Get ready"]')`, 'the Get ready tile')
  const finding = await evaluate(`(() => {
    const tile = document.querySelector('article[aria-label="Get ready"]')
    const box = (e) => e.getBoundingClientRect()
    if (document.querySelector('.cook-step__text, article[aria-label^="Step "]')) return 'a Step is on screen before Get ready is left'
    const rows = [...tile.querySelectorAll('li.list-row')]
    if (!rows.length) return 'Get ready has no Ingredient row'
    const bad = rows.find((r) => !r.querySelector('.list-row__title')?.textContent.trim() || !r.querySelector('.list-row__value')?.textContent.trim() || !r.querySelector('input[type="checkbox"], [role="checkbox"]'))
    if (bad) return 'a row lacks its name, its amount or its checkbox: ' + bad.textContent.trim().slice(0, 60)
    const cut = rows.flatMap((r) => [...r.querySelectorAll('.list-row__title, .list-row__meta, .list-row__value')]).find((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')
    if (cut) return 'a row text is cut: ' + cut.textContent.trim().slice(0, 40)
    const start = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start cooking')
    if (!start) return 'no Start cooking button'
    const s = box(start)
    if (start.getAttribute('data-variant') !== 'primary') return 'Start cooking is not the primary button'
    if (s.bottom <= 0 || s.top >= innerHeight) return 'Start cooking is outside the viewport'
    const back = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Back')
    if (back && !back.disabled) return 'Back is enabled on Get ready'
    if (document.documentElement.scrollWidth > innerWidth + 1) return 'the page scrolls sideways'
    return ''
  })()`)
  if (finding) throw new Error(`setup: not inspected: ${finding}`)
}

async function cookedConfirmation() {
  const target = await openCookOfFirstToConfirm()
  // The nav is drawn after the heading: wait for one of its buttons, then go past Get ready, to the last item, and Mark as Cooked or Mark all Cooked.
  await until(`!!(${BUTTON('Start cooking')}) || !!(${BUTTON('Next')}) || !!(${BUTTON('Mark as Cooked')}) || !!(${BUTTON('Mark all Cooked')})`, 'the Cook Mode navigation')
  if (await evaluate(`!!(${BUTTON('Start cooking')})`)) await press(BUTTON('Start cooking'), 'Start cooking')
  for (let i = 0; i < 80; i++) {
    if (await evaluate(`!!(${BUTTON('Mark as Cooked')}) || !!(${BUTTON('Mark all Cooked')})`)) break
    if (!(await evaluate(`!!(${BUTTON('Next')})`))) throw new Error('setup: neither Next nor Mark as Cooked is on screen')
    await press(BUTTON('Next'), 'Next')
    await evaluate(`new Promise((r) => setTimeout(r, 60))`)
  }
  const label = (await evaluate(`!!(${BUTTON('Mark all Cooked')})`)) ? 'Mark all Cooked' : 'Mark as Cooked'
  await press(BUTTON(label), label)
  await until(`!!document.querySelector('dialog[open]')`, 'the Mark as Cooked sheet')
  await until(`!!document.querySelector('dialog[open] button[data-variant="primary"]:not([disabled])')`, "the sheet's primary button")
  marked.push(target)
  await press(`document.querySelector('dialog[open] button[data-variant="primary"]')`, "the sheet's primary button")
  await until(`[...document.querySelectorAll('h1')].some((h) => h.textContent.trim() === 'Cooked, nice one!')`, 'the Cooked confirmation', 15000)
  const finding = await evaluate(`(() => {
    const c = document.querySelector('.cook-confirmation')
    if (!c) return 'no .cook-confirmation on the page'
    if (c.querySelector('[data-status="danger"], [data-status="spoil"]')) return 'a danger or spoil tile in the confirmation'
    if (c.querySelector('[role="alert"]')) return 'an alert in the confirmation'
    const bullet = [...c.querySelectorAll('li')].find((li) => [...li.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    if (bullet) return 'a list item with free text (a bullet sentence): ' + bullet.textContent.trim().slice(0, 60)
    const notices = c.querySelectorAll('.shortfall-notice')
    if (notices.length > 1) return notices.length + ' shortfall notices, there must be one'
    if (notices[0] && notices[0].querySelectorAll('li.detail-row').length === 0) return 'the shortfall notice has no DetailList rows'
    const primary = c.querySelector('.cook-confirmation__actions button[data-variant="primary"]')
    if (!primary) return 'no primary button in the confirmation'
    const r = primary.getBoundingClientRect()
    if (r.bottom <= 0 || r.top >= innerHeight) return 'the primary button is outside the viewport'
    if (document.querySelector('.toast')) return 'a toast is showing in Cook Mode'
    if (document.documentElement.scrollWidth > innerWidth + 1) return 'the page scrolls sideways'
    return ''
  })()`)
  if (finding) throw new Error(`setup: not inspected: ${finding}`)
}

async function leftoverFreezeSheet() {
  await reopenMarked()
  await until(`!!document.querySelector('main .bento-grid') && ${noSkeleton}`, 'the Today grid')
  // A Leftover that is not frozen, with portions and not past its Use-by: the seed's, else one made by marking a Course Cooked with 1.25 kept.
  let name = await evaluate(`(async () => {
    const r = await fetch('/api/plan/leftovers'); if (!r.ok) return null
    const list = await r.json()
    const l = (Array.isArray(list) ? list : list.leftovers ?? []).find((x) => !x.frozen && !x.toAnswer && x.portions > 0)
    return l ? l.recipeName : null
  })()`)
  if (!name) {
    const target = await firstToConfirm()
    const ok = await evaluate(`fetch('/api/plan/${target.date}/${target.mealSlotId}/${target.courseId}/cooked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leftoverPortions: 1.25 }) }).then((r) => r.ok)`)
    if (!ok) throw new Error('setup: not inspected: the seed has no Leftover and one could not be made by marking a Course Cooked')
    marked.push(target)
    await evaluate(`location.assign('/')`)
    await until(`!!document.querySelector('main .bento-grid') && ${noSkeleton}`, 'the Today grid')
    name = await evaluate(`(async () => { const l = (await (await fetch('/api/plan/leftovers')).json()); const a = Array.isArray(l) ? l : l.leftovers ?? []; return a.find((x) => !x.frozen && !x.toAnswer)?.recipeName ?? null })()`)
    if (!name) throw new Error('setup: not inspected: no Leftover to freeze')
  }
  // B9-44 (TB-11): on Today the row itself opens the Leftover's actions (no ⋮); elsewhere the row menu is still the way in.
  const ROW = `([...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(name + ', ')})) ?? document.querySelector('button[aria-label=${JSON.stringify('Actions for ' + name)}]'))`
  await press(ROW, 'the Leftover row')
  const FREEZE = `([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent.trim() === 'Freeze it') ?? [...document.querySelectorAll('dialog[open] *')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Freeze it').map((e) => e.closest('button, a') ?? e.closest('li')?.querySelector('button, a') ?? e)[0])`
  await until(`!!(${FREEZE})`, 'the Freeze it menu item')
  await press(FREEZE, '"Freeze it"')
  await until(`[...document.querySelectorAll('dialog[open] h2')].some((h) => /How many portions to freeze\\?/.test(h.textContent))`, 'the Freeze sheet')
  const finding = await evaluate(`(() => {
    const d = document.querySelector('dialog[open]')
    const buttons = [...d.querySelectorAll('button')]
    const primaries = buttons.filter((b) => b.getAttribute('data-variant') === 'primary')
    if (primaries.length !== 1) return primaries.length + ' primary buttons in the Freeze sheet, there must be one'
    if (buttons.some((b) => (b.getAttribute('aria-label') || b.textContent).trim() === 'Close')) return 'the Freeze sheet has a Close button (it has Cancel)'
    if (!d.querySelector('[role="group"][aria-label="Portions to freeze"]')) return 'no stepper named "Portions to freeze"'
    const select = d.querySelector('[role="combobox"], select')
    if (select && select.getBoundingClientRect().width > d.getBoundingClientRect().width * 0.6) return 'a full-width select is showing in the Freeze sheet'
    if (!buttons.some((b) => b.getAttribute('aria-label') === 'Change Storage Place')) return 'no Change Storage Place button'
    return ''
  })()`)
  if (finding) throw new Error(`setup: not inspected: ${finding}`)
}

export default {
  order: 360,
  scenarios: [
    { name: 'cooked-confirmation', route: '/recipes/:id', start: '/', setup: 'cookedConfirmation', widths: [390, 1440], rules: ['P1'] },
    { name: 'cook-get-ready', route: '/recipes/:id', start: '/', setup: 'cookGetReady', widths: [390, 1440], rules: ['P1'] },
    { name: 'leftover-freeze-sheet', route: '/', start: '/', setup: 'leftoverFreezeSheet', widths: [390], rules: ['P1'] },
  ],
  setups: {
    cookedConfirmation: () => withSnapshot(cookedConfirmation),
    cookGetReady: () => withSnapshot(cookGetReady),
    leftoverFreezeSheet: () => withSnapshot(leftoverFreezeSheet),
  },
}
