// B9-38 (plan section 9; PC-09, PC-10, RX-08, SHORT-02): the Plan's sheets, opened from the Plan as a person does.
// TEST-AUTHOR scenarios: each setup ASSERTS what the chapters' guards name and throws when it does not hold, so the scenario is "not inspected"
// (a failure) until the sheets are built; the rules then measure the open sheet.
//   plan-sheet-actions     /plan, 375, 390, 667x375 and 844x390: a Planned Meal sheet. The setup asserts the context line, ONE round (square)
//                          Close, no Cancel, at most 3 controls in `.sheet__footer`, all on one row, no `.plan-sheet__actions`. P25, P29, P30, P33.
//   plan-sheet-mark-cooked /plan, 375, 390, 667x375 and 844x390: Mark as Cooked from the footer. The Leftover portions stepper is above the footer,
//                          the footer is one row, and no label wraps (P30 on the footer's `data-one-line` buttons). P25, P29, P30, P33.
//   plan-sheet-swap        /plan, 375, 390 and 1440: Swap from the footer's ⋮: context line, "Now" and "Instead", "Keep it", no Close. P25, P33.
//   plan-sheet-choose      /plan, 375, 390 and 1440: Choose a Recipe from the footer's ⋮: context line, a search field, one Close. P25, P33.
//   plan-sheet-choose-ring /plan, 390 and 1440: the same sheet; every control's focus ring is whole and clear of the header (P39; R-C).
//   plan-sheet-whos-eating /plan, 390 and 844x390: Who's eating from a slot's ⋮: context line, Save (named "Save for this date", user decision)
//                          in the footer. P25, P29, P33.
// The sheet probes list these names (probes/sheet-targets.mjs, sheet-body.mjs) and the focus-rings probe lists plan-sheet-choose-ring.
import { evaluate, press, until } from '../helpers.mjs'

const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const DIALOG = `document.querySelector('dialog.sheet[open]:modal')`
/** The Leftover portions stepper of Mark as Cooked (named by its <label>, not an aria-label). */
const STEPPER = `[...(${DIALOG})?.querySelectorAll('[role="spinbutton"]') ?? []].find((e) => [...(e.labels ?? [])].some((l) => l.textContent.trim() === 'Leftover portions') || e.getAttribute('aria-label') === 'Leftover portions')`
const PLAN_READY = `document.querySelectorAll('main .list-row__target').length > 0 && !document.querySelector('[aria-busy="true"], .skeleton')`
/** The element (button, menu item or list-row target) whose text or aria-label is `text`, as page code, inside `root`. */
const named = (root, text) => `[...${root}.querySelectorAll('button, [role="menuitem"], a[href]')].find((e) => (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(text)})`

/** An item of the open ⋮ (a menu item from 768 px, else the Menu sheet's row), never a page button of the same name (the Couldn't plan
 *  tile's "Choose a Recipe" sits in the page, inert under the sheet). */
const menuItem = (text) => `([...document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent.trim() === ${JSON.stringify(text)}) ?? [...document.querySelectorAll('dialog[open] .list-row')].find((r) => (r.querySelector('.list-row__title')?.textContent.trim() ?? '') === ${JSON.stringify(text)})?.querySelector('button, a[href]'))`

/** What the page shows, appended to a failed setup's message. */
const SNAPSHOT = `JSON.stringify({
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\\s+/g, ' ').slice(0, 200)),
  footer: [...document.querySelectorAll('dialog[open] .sheet__footer button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
  menu: [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent.trim()),
})`
async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    throw new Error(`${e.message} [${await evaluate(SNAPSHOT).catch(() => '?')}]`)
  }
}
const closeSheets = async () => {
  for (let i = 0; i < 3 && (await evaluate(`!!${DIALOG}`)); i++) {
    await evaluate(`(() => { const d = ${DIALOG}; const b = d && ([...d.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === 'Close') || [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Keep it' || x.textContent.trim() === 'Cancel')); b?.click() })()`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * Opens the Planned Meal sheet of the first Plan row that has one with a footer ⋮ ("More for …": a planned meal). With `needs` the sheet
 * must also have that footer button ("Mark as Cooked"); a sheet that does not is closed and the next row tried.
 */
// `future`: only rows of the days after today (w4d review: at some hours of the guard's clock every slot of today has passed, and
// a past meal's Choose a Recipe opens no chooser).
async function openPlannedSheet(needs, future = false) {
  await until(PLAN_READY, 'the Plan rows')
  const rows = future ? `[...document.querySelectorAll('main .plan-day:not([data-today]) .list-row__target')]` : `[...document.querySelectorAll('main .list-row__target')]`
  const n = await evaluate(`Math.min(16, ${rows}.length)`)
  for (let i = 0; i < n; i++) {
    await evaluate(`${rows}[${i}]?.click()`)
    const open = await until(`!!${DIALOG}`, 'a sheet', 1500).then(() => true, () => false)
    if (!open) continue
    const ok = await evaluate(`(() => { const d = ${DIALOG}; if (!d.querySelector('.sheet__footer button[aria-label^="More for "]')) return false; return ${needs ? `!!(${named('d.querySelector(".sheet__footer")', needs)})` : 'true'} })()`)
    if (ok) return
    await closeSheets()
  }
  throw new Error(`setup: no Plan row opened a Planned Meal sheet with a footer ⋮${needs ? ` and "${needs}"` : ''}`)
}

/** PC-09 / SHORT-02 guards of a sheet's header and footer, as the chapter words them. Throws on the first that does not hold. */
const assertChromeJs = (requireContext) => `(() => {
  const d = ${DIALOG}
  if (!d) return 'no open sheet'
  const ctx = d.querySelector('.sheet__context')?.textContent.trim() ?? ''
  if (${requireContext} && !/^[A-Z][a-z]{2} \\d{1,2} · /.test(ctx)) return 'the context line is missing or is not "Tue 17 · …": ' + JSON.stringify(ctx)
  if (/\\d{4}-\\d{2}-\\d{2}/.test(d.innerText)) return 'an ISO date shows in the sheet'
  const closes = [...d.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === 'Close')
  const cancels = [...d.querySelectorAll('.sheet__footer button')].filter((b) => /^(Cancel|Keep it)$/.test(b.textContent.trim()))
  if (closes.length > 1) return 'more than one Close'
  if (closes.length === 1 && cancels.length > 0) return 'a Close and a Cancel'
  const c = closes[0]?.getBoundingClientRect()
  if (c && Math.abs(c.width - c.height) > 1) return 'Close is ' + c.width + 'x' + c.height + ', not square'
  if (d.querySelector('.plan-sheet__actions')) return 'the old .plan-sheet__actions column is still there'
  const foot = [...d.querySelectorAll('.sheet__footer button')].filter((b) => b.getClientRects().length > 0)
  if (foot.length > 3) return foot.length + ' controls in the footer (at most 3)'
  const tops = foot.map((b) => Math.round(b.getBoundingClientRect().top))
  if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) return 'the footer is not one row: tops ' + tops.join(',')
  return ''
})()`
async function assertChrome(requireContext = true) {
  const why = await evaluate(assertChromeJs(requireContext))
  if (why) throw new Error(`setup: ${why}`)
}

const scenarios = {
  order: 338,
  scenarios: [
    { name: 'plan-sheet-actions', route: '/plan', start: '/plan', setup: 'planSheetActions', widths: [375, 390, '667x375', '844x390'], emulate: TOUCH, rules: ['P25', 'P29', 'P30', 'P33'] },
    { name: 'plan-sheet-mark-cooked', route: '/plan', start: '/plan', setup: 'planSheetMarkCooked', widths: [375, 390, '667x375', '844x390'], emulate: TOUCH, rules: ['P25', 'P29', 'P30', 'P33'] },
    { name: 'plan-sheet-swap', route: '/plan', start: '/plan', setup: 'planSheetSwap', widths: [375, 390, 1440], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'plan-sheet-choose', route: '/plan', start: '/plan', setup: 'planSheetChoose', widths: [375, 390, 1440], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'plan-sheet-choose-ring', route: '/plan', start: '/plan', setup: 'planSheetChooseRing', widths: [390, 1440], rules: ['P39'] },
    { name: 'plan-sheet-whos-eating', route: '/plan', start: '/plan', setup: 'planSheetWhosEating', widths: [390, '844x390'], emulate: TOUCH, rules: ['P25', 'P29', 'P33'] },
  ],
  setups: {
    async planSheetActions() {
      await withSnapshot(async () => {
        await openPlannedSheet()
        await assertChrome()
      })
    },
    async planSheetMarkCooked() {
      await withSnapshot(async () => {
        await openPlannedSheet('Mark as Cooked')
        await press(named(`${DIALOG}.querySelector('.sheet__footer')`, 'Mark as Cooked'), 'Mark as Cooked in the sheet\'s footer')
        await until(`!!(${STEPPER})`, 'the Mark as Cooked sheet with its Leftover portions stepper', 8000)
        await assertChrome(false) // Mark as Cooked has no context line (the mock has none): only the footer and Close guards apply
        const hidden = await evaluate(`(() => { const d = ${DIALOG}; const s = (${STEPPER}).getBoundingClientRect(); const f = d.querySelector('.sheet__footer').getBoundingClientRect(); return s.bottom > f.top + 1 })()`)
        if (hidden) throw new Error('setup: the Leftover portions stepper is hidden behind the footer')
      })
    },
    async planSheetSwap() {
      await withSnapshot(async () => {
        await openPlannedSheet()
        await press(`${DIALOG}.querySelector('.sheet__footer button[aria-label^="More for "]')`, 'the footer ⋮')
        await until(`!!(${named('document', 'Swap')})`, 'the Swap item', 4000)
        await press(named('document', 'Swap'), 'Swap in the ⋮')
        await until(`!!(${DIALOG}?.querySelector('.sheet__title')?.textContent.startsWith('Swap '))`, 'the Swap sheet', 8000)
        await until(`!!document.querySelector('dialog.sheet[open] [aria-label="Now"]') && !document.querySelector('dialog.sheet[open] [aria-busy="true"]')`, 'Now and Instead', 8000)
        await assertChrome()
        if (!(await evaluate(`!!document.querySelector('dialog.sheet[open] [aria-label="Instead"], dialog.sheet[open] [aria-label="Now"]')`))) throw new Error('setup: no Now / Instead lists')
      })
    },
    async planSheetChoose() {
      await withSnapshot(async () => {
        await openPlannedSheet(undefined, true)
        await press(`${DIALOG}.querySelector('.sheet__footer button[aria-label^="More for "]')`, 'the footer ⋮')
        await until(`!!(${menuItem('Choose a Recipe')})`, 'the Choose a Recipe item', 4000)
        await press(menuItem('Choose a Recipe'), 'Choose a Recipe in the ⋮')
        await until(`!!(${DIALOG}?.querySelector('.sheet__title')?.textContent.trim() === 'Choose a Recipe') && !!(${DIALOG}.querySelector('[role="searchbox"], input[type="search"]'))`, 'the Choose a Recipe sheet with its search field', 8000)
        await assertChrome()
        const label = await evaluate(`(${DIALOG}.querySelector('[role="searchbox"], input[type="search"]').getAttribute('aria-label') || '')`)
        if (!/^Search .*Recipes$/.test(label)) throw new Error(`setup: the search field is "${label}", not "Search <Course> Recipes"`)
      })
    },
    // w4d review: the same sheet with its list narrowed by the search to a few rows that fit, so the body does not scroll. The shared
    // clipped-rings probe (order 100) scrolls every sheet-body control into view before focus-rings (order 180) measures, which left
    // rows scrolled up beside the header; focus-rings does not clip a neighbour by its scroller, so Close's ring read as touching them.
    // On the real screen (scrolled by hand, then Close focused) the body clips under the header and the ring stays clear of it.
    async planSheetChooseRing() {
      await scenarios.setups.planSheetChoose()
      await withSnapshot(async () => {
        await evaluate(`(() => { const f = ${DIALOG}.querySelector('[role="searchbox"], input[type="search"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(f, 'a'); f.dispatchEvent(new Event('input', { bubbles: true })) })()`)
        await until(`(() => { const b = ${DIALOG}.querySelector('.sheet__body'); return b.scrollHeight <= b.clientHeight + 1 })()`, 'the Choose list narrowed to rows that fit', 4000).catch(async () => {
          await evaluate(`(() => { const f = ${DIALOG}.querySelector('[role="searchbox"], input[type="search"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(f, 'pan'); f.dispatchEvent(new Event('input', { bubbles: true })) })()`)
          await until(`(() => { const b = ${DIALOG}.querySelector('.sheet__body'); return b.scrollHeight <= b.clientHeight + 1 })()`, 'the Choose list narrowed to rows that fit', 4000)
        })
        if (!(await evaluate(`${DIALOG}.querySelectorAll('.list-row').length > 0`))) throw new Error('setup: the narrowed Choose list has no row')
      })
    },
    async planSheetWhosEating() {
      await withSnapshot(async () => {
        await until(PLAN_READY, 'the Plan rows')
        const menus = await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]').length`)
        for (let i = 0; i < menus; i++) {
          await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]')[${i}]?.click()`)
          const has = await until(`!!(${named('document', "Who's eating")})`, "the Who's eating item", 1200).then(() => true, () => false)
          if (has) {
            await press(named('document', "Who's eating"), "Who's eating in the slot ⋮")
            await until(`!!(${DIALOG}?.querySelector('.sheet__title')?.textContent.trim() === "Who's eating") && !!${DIALOG}.querySelector('.sheet__footer button')`, "the Who's eating sheet", 8000)
            const why = await evaluate(`(() => { const d = ${DIALOG}; const c = d.querySelector('.sheet__context')?.textContent.trim() ?? ''; if (!/^[A-Z][a-z]{2} \\d{1,2} [A-Z][a-z]{2} · /.test(c)) return 'the context line is "' + c + '", not "Thu 12 Nov · Dinner"'; const f = [...d.querySelectorAll('.sheet__footer button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()); if (!f.includes('Save for this date')) return 'Save for this date is not in the footer: ' + f.join(' | '); return '' })()`)
            if (why) throw new Error(`setup: ${why}`)
            return
          }
          await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]')[${i}]?.click()`) // the same ⋮ again closes its menu
        }
        throw new Error("setup: no slot ⋮ offered Who's eating")
      })
    },
  },
}
export default scenarios
