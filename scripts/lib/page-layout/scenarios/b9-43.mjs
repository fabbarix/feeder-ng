// B9-43 (SSP-04, SSP-09, SSP-13, SSP-14; plan section 9): the guard scenarios of the Shop's notice, complete tile and open Line sheet.
//   shop-notice            /shop at 375, 390, 834 and 1440: the notice's title "Not marked Cooked yet" is never cut (P23 reads `.shop-notice__title`
//                          too: probes/cut-meta.mjs), and its slots line may clamp to two lines but the title stays whole. The setup throws when the
//                          seed has no notice ("not inspected"), or when the title is not the first text of the tile, or the clamp is on the title.
//   shop-line-sheet        /shop: the first open Line's sheet (To get and Estimated rows, "For", the footer) at 375, 390, 834, 1440 with touch
//                          emulation: P25 (targets), P33 (sheet body), P23. The setup throws unless the sheet has its two R-E lists and ONE Close.
//   shop-line-sheet-price  the first open Line's sheet that has "Change the Price", with it pressed: the Price sheet over it (one Close, the keypad's), P25 and P33
//                          at 375, 390 and 1440. The setup throws when the Product has no button (no seeded Product for the first Line).
//   shop-complete          /shop with every open Line ticked (by the setup, through the API): the "Shopping List complete" status tile with its
//                          three rows and at most ONE primary button inside it; the strip's Scan is not primary; its buttons are not cut.
//                          P23 at 375, 390, 834 and 1440. It leaves its unit's copy of the seed complete; the next unit starts on a fresh
//                          copy (fast-checks), so the shop-complete-restore scenario that unticked it all again is gone.
// Selectors are the app's: `.shop-notice`, `.shop-lines .list-row__target`, `dialog.sheet[open]`, `.celebration-tile`.
import { byText, evaluate, press, until } from '../helpers.mjs'

const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const dialogOpen = `!!document.querySelector('dialog.sheet[open]')`

/**
 * The first open Line whose sheet offers "Change the Price" (main-session ruling 3: under Any Shop a last-bought pack has no Shop to price
 * at, so its sheet has no button): each Line's sheet is opened and closed in turn. false when none has it.
 */
async function openPriceableLineSheet() {
  await until(`document.querySelectorAll('.shop-open .shop-lines .list-row__target').length > 0 && !document.querySelector('.skeleton')`, 'the Shop\'s open Lines')
  return evaluate(`(async () => {
    const wait = async (f) => { for (let i = 0; i < 40 && !f(); i++) await new Promise((r) => setTimeout(r, 100)) }
    // B9-55: the Supplies group's open Lines too (their packs are priced and never bought in the seed, so they offer it under Any Shop).
    for (const t of document.querySelectorAll('.shop-open .shop-lines .list-row__target, .shop-supplies .shop-lines .list-row__target')) {
      t.click()
      await wait(() => document.querySelector('dialog.sheet[open]'))
      const d = document.querySelector('dialog.sheet[open]')
      if (d && [...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Change the Price')) return true
      d?.querySelector('button[aria-label="Close"]')?.click()
      await wait(() => !document.querySelector('dialog.sheet[open]'))
    }
    return false
  })()`)
}

async function openFirstLineSheet() {
  await until(`document.querySelectorAll('.shop-open .shop-lines .list-row__target').length > 0 && !document.querySelector('.skeleton')`, 'the Shop\'s open Lines')
  await evaluate(`document.querySelector('.shop-open .shop-lines .list-row__target').click()`)
  await until(dialogOpen, 'the open Line\'s sheet')
}

export default {
  order: 350,
  scenarios: [
    { name: 'shop-notice', route: '/shop', start: '/shop', setup: 'shopNotice', widths: [375, 390, 834, 1440], rules: ['P23'] },
    { name: 'shop-line-sheet', route: '/shop', start: '/shop', setup: 'shopLineSheet', widths: [375, 390, 834, 1440], emulate: TOUCH, rules: ['P23', 'P25', 'P33'] },
    { name: 'shop-line-sheet-price', route: '/shop', start: '/shop', setup: 'shopLineSheetPrice', widths: [375, 390, 1440], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'shop-complete', route: '/shop', start: '/shop', setup: 'shopComplete', widths: [375, 390, 834, 1440], rules: ['P23'] },
  ],
  setups: {
    async shopNotice() {
      await until(`!!document.querySelector('.shop-notice') && !document.querySelector('.skeleton')`, 'the Shop\'s notice (the seed needs Planned Meals not marked Cooked yet)')
      const facts = await evaluate(`(() => {
        const n = document.querySelector('.shop-notice')
        const title = n.querySelector('.shop-notice__title')
        const slots = n.querySelector('.shop-notice__slots')
        return {
          title: title ? title.textContent.replace(/\\s+/g, ' ').trim() : null,
          titleFirst: !!title && !!slots && !!(title.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_FOLLOWING),
          titleClamped: !!title && (getComputedStyle(title).webkitLineClamp !== 'none' || getComputedStyle(title).textOverflow === 'ellipsis'),
          labelled: n.getAttribute('aria-labelledby') === (title && title.id) && !!(title && title.id),
        }
      })()`)
      if (!facts.title || !/^Not marked Cooked yet/.test(facts.title)) throw new Error(`setup: SSP-04: the notice's title is "${facts.title}", not "Not marked Cooked yet"`)
      if (!facts.titleFirst) throw new Error('setup: SSP-04: the slots must come after the title')
      if (facts.titleClamped) throw new Error('setup: SSP-04: the title is clamped or ellipsized; only the slots line may clamp')
      if (!facts.labelled) throw new Error('setup: SSP-04: the notice section is not named by its title (aria-labelledby)')
    },
    async shopLineSheet() {
      await openFirstLineSheet()
      const facts = await evaluate(`(() => {
        const d = document.querySelector('dialog.sheet[open]')
        return {
          line: !!d.querySelector('ul[aria-label="Line"].detail-list'),
          closes: [...d.querySelectorAll('button')].filter((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === 'Close').length,
          cancel: [...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel'),
          primaries: d.querySelectorAll('button[data-variant="primary"]').length,
          footer: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t === 'Not needed' || t === 'Get something else…'),
        }
      })()`)
      if (!facts.line) throw new Error('setup: SSP-13: the open Line\'s sheet has no "Line" DetailList (To get / Estimated)')
      if (facts.closes !== 1 || facts.cancel) throw new Error(`setup: one Close and no Cancel per sheet: ${facts.closes} Close, Cancel ${facts.cancel}`)
      if (facts.primaries !== 0) throw new Error('setup: the Line sheet has a primary button (the one primary on /shop is Scan)')
      if (!facts.footer.includes('Not needed') || !facts.footer.includes('Get something else…')) throw new Error('setup: SSP-14: the footer lacks "Get something else…" and "Not needed"')
    },
    async shopLineSheetPrice() {
      // B9-55: the scan scenarios (order 40) tick the seed's priced food Lines; their packs are then last-bought ones, with no Shop to price
      // at under Any Shop (ruling 3). The Supplies group's Lines (priced, never bought) still offer it, so they are tried too.
      const found = await openPriceableLineSheet()
      if (!found) {
        const lines = await evaluate(`fetch('/api/shopping/list').then((r) => r.json()).then((l) => (l.lines ?? []).map((x) => x.name + (x.ticked ? ' (ticked)' : '') + (x.pack ? ' pack ' + x.pack.productId + (x.pack.bought === false ? ' unbought' : ' bought') : '')).join(', '))`)
        throw new Error(`setup: SSP-13: no open Line has "Change the Price" (the seed needs a priced Product at a Shop for one); the Lines: ${lines}`)
      }
      await press(byText('dialog.sheet[open] button', 'Change the Price'), '"Change the Price"')
      await until(`document.querySelectorAll('dialog.sheet[open]').length >= 2 && !!document.querySelector('.price-keypad')`, 'the Price sheet over the Line sheet')
      const closes = await evaluate(`[...document.querySelectorAll('dialog.sheet[open]')].pop().querySelectorAll('button[aria-label="Close"], .price-keypad button').length`)
      if (!closes) throw new Error('setup: the Price sheet has no Close')
    },
    // Ticks every open Line (its suggested pack amount, else what is left; so Stock Lots are added and some are Not sorted) and every open extra,
    // then reloads: the list is complete and the tile shows. A list that is not complete after that is "not inspected".
    async shopComplete() {
      await until(`!document.querySelector('.skeleton') && !!document.querySelector('.shop-screen')`, 'the Shop')
      const done = await evaluate(`(async () => {
        const json = async (r) => (r.ok ? r.json() : null)
        const list = await json(await fetch('/api/shopping/list'))
        if (!list) return { error: 'the list did not load' }
        const ids = []
        const extras = []
        const failed = []
        if (!list.complete) {
          for (const l of list.lines.filter((x) => !x.ticked)) {
            const quantity = l.pack ? l.pack.count * l.pack.size : l.quantity
            const r = await fetch('/api/shopping/ticks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: l.ingredientId, to: list.to, quantity, clientUuid: 'layout-complete-' + l.ingredientId }) })
            if (r.ok) ids.push(l.ingredientId)
            else failed.push('line ' + l.name + ' ' + r.status)
          }
          for (const e of list.extras.filter((x) => !x.ticked)) {
            const r = await fetch('/api/shopping/extras/' + e.id + '/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 0 }) })
            if (r.ok) extras.push(e.id)
            else failed.push('extra ' + e.id + ' ' + r.status)
          }
        }
        // a ticked Line that shows "more since your tick" (b9-34's seed makes some) is covered by one more tick of that amount
        const mores = []
        const again = await json(await fetch('/api/shopping/list'))
        for (const l of (again?.lines ?? []).filter((x) => x.ticked && x.more > 0)) {
          const uuid = 'layout-complete-more-' + l.ingredientId
          const r = await fetch('/api/shopping/ticks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: l.ingredientId, to: list.to, quantity: l.more, clientUuid: uuid }) })
          if (r.ok) mores.push(uuid)
          else failed.push('more ' + l.name + ' ' + r.status)
        }
        // what a tick does not cover (a Line that keeps its More) is taken off the list as Not needed, like the More row's own action; restored below
        const off = []
        for (const l of ((await json(await fetch('/api/shopping/list')))?.lines ?? []).filter((x) => x.ticked && x.more > 0)) {
          const r = await fetch('/api/shopping/not-needed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingredientId: l.ingredientId, to: list.to }) })
          if (r.ok) off.push(l.ingredientId)
          else failed.push('not needed ' + l.name + ' ' + r.status)
        }
        const after = await json(await fetch('/api/shopping/list'))
        const left = after ? [...after.lines.filter((x) => !x.ticked || x.more > 0).map((x) => x.name + (x.more > 0 ? ' (more ' + x.more + ')' : '')), ...after.extras.filter((x) => !x.ticked).map((x) => 'extra ' + x.id)] : ['?']
        return { to: list.to, ids, extras, mores, off, failed, complete: !!after?.complete, left }
      })()`)
      if (done.error) throw new Error(`setup: ${done.error}`)
      if (!done.complete) throw new Error(`setup: the list is not complete after the setup ticked every open Line (left: ${done.left.join(', ') || 'none'}; failed ticks: ${done.failed.join(', ') || 'none'})`)
      await evaluate('location.reload()')
      await until(`!!document.querySelector('.celebration-tile')`, `the "Shopping List complete" tile (every Line ticked; the setup's ticks that failed: ${done.failed.join(', ') || 'none'})`, 15000)
      const facts = await evaluate(`(() => {
        const t = document.querySelector('.celebration-tile')
        const buttons = [...t.querySelectorAll('button')]
        return {
          status: t.getAttribute('data-status'),
          rows: t.querySelectorAll('ul[aria-label="This shop"] > li').length,
          primaries: buttons.filter((b) => b.getAttribute('data-variant') === 'primary').length,
          cut: buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()),
          scanPrimary: !!document.querySelector('.shop-metrics__scan[data-variant="primary"]'),
        }
      })()`)
      if (facts.status !== 'success') throw new Error(`setup: SSP-09: the complete tile is a "${facts.status}" tile, not a success status tile`)
      if (facts.rows < 2) throw new Error(`setup: SSP-09: the tile has ${facts.rows} rows; it needs "Lines ticked" and "Stock Lots added" at least`)
      if (facts.primaries > 1) throw new Error(`setup: SSP-09: ${facts.primaries} primary buttons in the complete tile; one at most`)
      if (facts.scanPrimary) throw new Error('setup: SSP-09: the strip\'s Scan is still primary on a complete list (it is the outlined secondary then)')
      if (facts.cut.length > 0) throw new Error(`setup: SSP-09: a button in the complete tile is cut: ${facts.cut.join(', ')}`)
    },
  },
}
