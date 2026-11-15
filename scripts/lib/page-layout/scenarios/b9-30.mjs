// B9-30 (SET-01, SET-02, SET-04, SET-13, SET-14a, SAFE-02): the Shop and Product pages.
//   shop-page             /settings/shops/:id at 375, 834 and 1440: the Prices known here tile holds at least one .list-row (SET-02: the page used to
//                         say "No Prices recorded" over a Shop that has Prices); P1 no sideways scroll, P13 no tile overflow, P40 no narrow title.
//   shop-delete-confirm   the Delete Shop confirm open (SAFE-02): Cancel has focus, the dialog has no Close, and the counts are rows; P1, P8.
//   product-page          /products/:id at 375, 834 and 1440: Prices rows with a value column, the history open, and the spacing rule "shapes
//                         never touch": "Add Price" is at least 8 px from the Price history button, and "Add barcode" at least 8 px from the
//                         "Shop Barcodes" heading. At 834 and up Sold at and Pack size sit side by side (SET 2, cards two-up). The setup
//                         throws on any of these, so the page is "not inspected" (and fails), never passed unmeasured.
//   products-new-product  /products with the New Product sheet open (SET 4): the Ingredient Select first, Cancel and Save Product in the
//                         footer, no Close; P1, P33.
// The product-page setup makes an older Price (30 days back, at the Shop of the seeded Price) so there is a history; it is harmless to the
// other scenarios and is made once (a PUT of the same Product, Shop and date replaces itself).
import { byText, evaluate, press, until } from '../helpers.mjs'

const GAP = 8
const pageReady = `!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`

async function olderPrice() {
  const made = await evaluate(`(async () => {
    const id = location.pathname.split('/').pop()
    const latest = await (await fetch('/api/products/' + id)).json()
    const first = (latest.latestPrices ?? [])[0]
    if (!first) return 'no-price'
    const d = new Date(first.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 30)
    const r = await fetch('/api/products/' + id + '/prices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shopId: first.shopId, date: d.toISOString().slice(0, 10), priceCents: 149 }) })
    return r.ok ? 'ok' : 'failed ' + r.status
  })()`)
  if (made !== 'ok') throw new Error(`setup: the older Price for the Price history could not be made (${made})`)
}

export default {
  order: 330,
  scenarios: [
    { name: 'shop-page', route: '/settings/shops/:id', start: '/settings/shops/:id', setup: 'shopPage', widths: [375, 834, 1440], rules: ['P1', 'P13', 'P40'] },
    { name: 'shop-delete-confirm', route: '/settings/shops/:id', start: '/settings/shops/:id', setup: 'shopDeleteConfirm', widths: [375, 1440], rules: ['P1', 'P8'] },
    { name: 'product-page', route: '/products/:id', start: '/products/:id', setup: 'productPage', widths: [375, 834, 1440], rules: ['P1', 'P13', 'P40'] },
    { name: 'products-new-product', route: '/products', start: '/products', setup: 'newProductSheet', widths: [375, 1440], rules: ['P1', 'P33'] },
  ],
  setups: {
    async shopPage() {
      await until(pageReady, 'the Shop page')
      await until(`!!document.querySelector('[aria-label="Prices known here"] .list-row')`, 'a Price row in the Prices known here tile (the seeded Shop has Prices)')
    },
    async shopDeleteConfirm() {
      await until(pageReady, 'the Shop page')
      await press(byText('main button', 'Delete Shop'), '"Delete Shop"')
      await until(`!!document.querySelector('dialog[open]')`, 'the Delete Shop confirm')
      const state = await evaluate(`(() => {
        const d = document.querySelector('dialog[open]')
        const cancel = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
        const close = [...d.querySelectorAll('button')].find((b) => /^close$/i.test((b.getAttribute('aria-label') || b.textContent).trim()))
        return { cancelFocused: !!cancel && document.activeElement === cancel, hasClose: !!close, rows: d.querySelectorAll('.detail-row').length, paragraph: d.textContent.includes('go too') }
      })()`)
      if (!state.cancelFocused) throw new Error('setup: Cancel has no focus in the Delete Shop confirm')
      if (state.hasClose) throw new Error('setup: the Delete Shop confirm has a Close beside Cancel')
      if (state.paragraph) throw new Error('setup: the Delete Shop confirm lists what goes as a sentence, not as rows')
    },
    async productPage() {
      await until(pageReady, 'the Product page')
      await until(`!!document.querySelector('[aria-label="Prices"] .list-row')`, 'a Price row on the Product page')
      await olderPrice()
      await evaluate(`location.reload()`)
      await until(pageReady, 'the Product page after the older Price')
      await until(`!!document.querySelector('[aria-label="Prices"] .list-row')`, 'a Price row on the Product page')
      await press(`[...document.querySelectorAll('[aria-label="Prices"] button')].find((b) => /^Price history/.test(b.textContent.trim()))`, 'the "Price history" button')
      const bad = await evaluate(`(() => {
        const box = (e) => e.getBoundingClientRect()
        const gap = (a, b) => { const r = box(a), s = box(b); return Math.max(s.top - r.bottom, r.top - s.bottom, 0) }
        const out = []
        const btn = (root, rx) => [...document.querySelectorAll(root + ' button')].find((b) => rx.test(b.textContent.trim()))
        const add = btn('[aria-label="Prices"]', /^Add Price$/), history = btn('[aria-label="Prices"]', /^Price history/)
        if (!add || !history) out.push('Add Price or Price history is missing')
        else if (gap(add, history) < ${GAP}) out.push('Add Price is ' + gap(add, history).toFixed(1) + ' px from Price history')
        const addBarcode = btn('[aria-label="Barcodes"]', /^Add barcode$/)
        const heading = [...document.querySelectorAll('[aria-label="Barcodes"] h2, [aria-label="Barcodes"] h3')].find((h) => h.textContent.trim() === 'Shop Barcodes')
        if (!addBarcode || !heading) out.push('Add barcode or the Shop Barcodes heading is missing')
        else if (gap(addBarcode, heading) < ${GAP}) out.push('Add barcode is ' + gap(addBarcode, heading).toFixed(1) + ' px from the Shop Barcodes heading')
        const sold = document.querySelector('[aria-label="Sold at"]'), pack = document.querySelector('[aria-label="Pack size"]')
        if (window.innerWidth >= 834 && sold && pack && Math.abs(box(sold).top - box(pack).top) > 2) out.push('Sold at and Pack size are not side by side at ' + window.innerWidth + ' px')
        const rows = document.querySelectorAll('[aria-label="Prices"] .list-row .list-row__value')
        if (rows.length === 0) out.push('the Price rows have no value column')
        return out
      })()`)
      if (bad.length > 0) throw new Error(`setup: ${bad.join('; ')}`)
    },
    async newProductSheet() {
      await until(pageReady, 'the Products list')
      await press(byText('main button', 'New Product'), '"New Product"')
      await until(`!!document.querySelector('dialog[open] [role="combobox"]')`, 'the New Product sheet with its Ingredient Select')
      const first = await evaluate(`(() => { const d = document.querySelector('dialog[open]'); const c = d.querySelector('[role="combobox"]'); return { label: (c.getAttribute('aria-label') || (document.getElementById(c.getAttribute('aria-labelledby') || '')?.textContent ?? '')).trim(), close: !![...d.querySelectorAll('button')].find((b) => /^close$/i.test((b.getAttribute('aria-label') || b.textContent).trim())) } })()`)
      if (first.label !== 'Ingredient') throw new Error(`setup: the first Select of the New Product sheet is "${first.label}", not "Ingredient"`)
      if (first.close) throw new Error('setup: the New Product sheet has a Close beside Cancel')
    },
  },
}
