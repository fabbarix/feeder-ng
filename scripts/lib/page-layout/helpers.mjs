// The helpers the scenario setups use (B9-03). The driver (scripts/check-page-layout.mjs) installs its page access once with
// installHelpers({ evaluate, sleep, ids }) after the session starts; every setup is also called with this module's `h` bag, so a
// package's own setup may take it as its argument (async (h) => ...) or import the helpers by name, as the moved setups do.
// Nothing here runs in the page by itself: the expressions are page code that evaluate() sends.
let bag = null
/** The ids file of the seed (live binding: set by installHelpers). */
export let ids = {}
/**
 * Called once by the driver: evaluate(expression) runs page code in the current tab; sleep(ms); ids is the seed's ids file; B9-54: cdp(method,
 * params) sends a Chrome DevTools Protocol call to the current tab (h.cdp; absent when the driver has none).
 */
export function installHelpers(page) {
  bag = page
  ids = page.ids
  Object.assign(h, { ids, cdp: page.cdp })
  return h
}
/** Runs page code in the current tab (the driver's evaluate). */
export const evaluate = (expr) => {
  if (!bag) throw new Error('setup helpers used before installHelpers()')
  return bag.evaluate(expr)
}
const sleep = (ms) => (bag ? bag.sleep(ms) : new Promise((r) => setTimeout(r, ms)))

// beta.7 (H8, SR6, RR5): the setups of the scenarios with a `setup` (scenarios/*.mjs). Each one runs in the page
// opened at the scenario's `start` and brings it to the state the probes measure: a sheet open, a Scan session with rows, a receipt
// photo, a done read. A step whose state does not show throws, so the probe is not inspected (and fails) instead of measuring the
// wrong page. The dark pass replays the setup in a fresh page (the photos and the read are in memory only).
export const js = JSON.stringify
/** Polls the page until `expr` is truthy, or throws after `ms`. */
export const until = async (expr, what, ms = 10000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await evaluate(expr).catch(() => false)) return
    await sleep(150)
  }
  throw new Error(`setup: ${what} did not show within ${ms / 1000} s`)
}
/** Clicks the element `expr` evaluates to, or throws. */
export const press = async (expr, what) => {
  if (!(await evaluate(`(() => { const e = ${expr}; if (!e || e.disabled) return false; e.click(); return true })()`))) throw new Error(`setup: no ${what} to press`)
}
/** The element of `sel` whose trimmed text (or aria-label) is `text`, as page code. */
export const byText = (sel, text) => `[...document.querySelectorAll(${js(sel)})].find((e) => e.textContent.trim() === ${js(text)} || e.getAttribute('aria-label') === ${js(text)})`
/** Sets a React-controlled input's value as typing does. */
export const typeInto = (sel, value) =>
  `(() => { const e = document.querySelector(${js(sel)}); if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${js(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
// B9-41 (P41): the Scanned list is named by its visible heading (aria-labelledby) now, not by an aria-label; the name is the same.
export const SCANNED_UL = `[...document.querySelectorAll('.scan-screen__list ul.list-group__list')].find((u) => (u.getAttribute('aria-label') || document.getElementById(u.getAttribute('aria-labelledby') || '')?.textContent || '').trim() === 'Scanned list')`
export const SCANNED_ROWS = `((${SCANNED_UL})?.querySelectorAll(':scope > .list-row').length ?? 0)`
export const READ_ROW = `[...document.querySelectorAll('.scan-screen__list .list-row')].find((r) => r.querySelector('.list-row__title')?.textContent.trim() === 'Read the receipt')`

/** A Shop session of the seeded Shop on /scan, the barcodes typed through the no-camera block (the storage was cleared first). */
export async function scanSession(codes) {
  await until(`!!document.querySelector('.shop-picker, .scan-screen__split')`, 'the Scan screen')
  if (await evaluate(`!!document.querySelector('.shop-picker')`)) {
    await press(`document.querySelector('.shop-picker .list-row__target[aria-label=' + ${js(js(ids.shopName ?? ''))} + ']')`, `Shop "${ids.shopName}" in the picker`)
  }
  await until(`!!document.querySelector('.scan-screen__split')`, 'the shop session')
  // B9-35 (SSP-06): a headless Chrome has no camera, so the camera bar shows and the typed entry is open under it (no button to press).
  // With a camera (a scenario's fake one) the entry opens with "Type a barcode".
  await until(`!!document.querySelector('.scan-screen__split [data-typed-entry]') || !!document.querySelector('.scan-screen__split button[aria-controls][aria-expanded]')`, 'the typed entry (a headless Chrome has no camera)', 15000)
  for (const code of codes) {
    const before = await evaluate(SCANNED_ROWS)
    if (!(await evaluate(`!!document.querySelector('[data-typed-entry] input')`))) await press(byText('button[aria-controls][aria-expanded]', 'Type a barcode'), '"Type a barcode"')
    await until(`!!document.querySelector('[data-typed-entry] input')`, 'the barcode field')
    if (!(await evaluate(typeInto('[data-typed-entry] input', code)))) throw new Error('setup: the barcode field went away')
    await press(`document.querySelector('[data-typed-entry] button[type=submit]')`, '"Use this barcode"')
    const t0 = Date.now()
    await until(`${SCANNED_ROWS} > ${before} || !!document.querySelector('dialog.sheet[open]')`, `the scan of ${code}`).catch(async (e) => {
      const seen = await evaluate(`JSON.stringify({ rows: ${SCANNED_ROWS}, before: ${before}, input: document.querySelector('[data-typed-entry] input')?.value, main: (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 400), toasts: [...document.querySelectorAll('.toast')].map((t) => t.innerText) })`).catch(() => '?')
      throw new Error(`${e.message} [${seen}]`)
    })
    if (process.env.PAGE_LAYOUT_DEBUG) console.error(`   scan ${code}: ${Date.now() - t0}ms`)
  }
  // The "Added …" toasts are transient: dismissed, so the probes and a screenshot see the screen under them.
  await evaluate(`document.querySelectorAll('.toast > button:last-child').forEach((b) => b.click())`)
}
/** The seeded barcodes scanned, and the "Read the receipt" footer row ready (its scans synced, the assistant on). */
export async function scannedList() {
  if (!ids.assistant) throw new Error('setup: the seeder did not turn the Recipe Assistant on (no fake Anthropic API), so "Read the receipt" cannot be read')
  await scanSession(ids.scanBarcodes ?? [])
  await until(`(() => { const r = ${READ_ROW}; return !!r && !!r.querySelector('.list-row__target') })()`, 'the "Read the receipt" footer row, ready', 15000)
}
/** A 640 x 1100 JPEG of a printed receipt, put in the photos screen's file input as the camera would. */
export const ADD_PHOTO = `(async () => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 1100
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '28px monospace'
  ;['COOP', 'PASSATA         1.29', 'FLOUR PACK      1.99', 'KITCHEN ROLL    3.49', 'TOTAL          13.03'].forEach((t, i) => g.fillText(t, 40, 80 + i * 60))
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
  const input = document.querySelector('.receipt-add input[type=file]')
  if (!input) return false
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }))
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return true
})()`
export async function receiptPhotos(n) {
  await scannedList()
  await press(`(${READ_ROW})?.querySelector('.list-row__target')`, '"Read the receipt" row')
  await until(`location.pathname === '/scan/receipt' && !!document.querySelector('.receipt-add')`, 'the receipt photos screen')
  for (let i = 1; i <= n; i++) {
    if (!(await evaluate(ADD_PHOTO))) throw new Error('setup: the photos screen has no file input')
    await until(`document.querySelectorAll('.receipt-photos > li').length >= ${i}`, `receipt photo ${i}`)
  }
}

// b8-hint (P23): the Shop hint is "<weekday> <Meal Slot> +N", so its width depends on the day the guard runs ("Fri Dinner +2"
// passed, "Sat Breakfast +2" was cut the next day). Every food Line's hint is pinned to the worst case: the widest of the seven
// weekdays x the household's Meal Slots, measured in the meta's own font, then " +12". The text node React owns is rewritten in
// place, so the layout is the real one and only the words are pinned. The Supplies group's Restock reason keeps its text.
export const PIN_WORST_HINT = `(async () => {
  const sel = '.shop-open .shop-lines .list-row__meta[data-status="info"] .list-row__meta-text'
  const metas = [...document.querySelectorAll(sel)] // the To get section only: the Supplies group is its own section
  if (metas.length === 0) return 'no food Line hint'
  const r = await fetch('/api/meal-slots', { credentials: 'same-origin' })
  if (!r.ok) return 'GET /api/meal-slots ' + r.status
  const body = await r.json()
  const list = Array.isArray(body) ? body : (Object.values(body ?? {}).find(Array.isArray) ?? [])
  const names = [...new Set(list.map((s) => s.name).filter(Boolean))]
  if (names.length === 0) return 'no Meal Slots'
  const g = document.createElement('canvas').getContext('2d')
  g.font = getComputedStyle(metas[0]).font
  let worst = '', widest = -1
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) for (const name of names) {
    const w = g.measureText(day + ' ' + name).width
    if (w > widest) { widest = w; worst = day + ' ' + name }
  }
  worst += ' +12'
  for (const t of metas) {
    const n = [...t.childNodes].find((c) => c.nodeType === Node.TEXT_NODE)
    if (!n) return 'a hint without its own text node'
    n.data = worst
  }
  return 'ok'
})()`
export async function pinWorstHint() {
  const res = await evaluate(PIN_WORST_HINT)
  if (res !== 'ok') throw new Error(`setup: the Shop hint could not be pinned to the worst case (${res})`)
}

/** The helper bag every setup is called with. */
export const h = { evaluate, sleep, ids, js, until, press, byText, typeInto, scanSession, scannedList, receiptPhotos, pinWorstHint }
