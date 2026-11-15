// beta.7 (SR6, docs/design/shop-scan-proposals.md 13): the Scan screen in shop mode. A headless Chrome has no camera, so the
// no-camera block shows and the guard types the seeded codes by hand. The Scanned list with its rows and the "Read the receipt" footer
// row; a row active with its strip; the Price keypad (a non-modal half sheet on a phone, docked from 768 px); the new-Product sheet.
import { byText, evaluate, ids, press, scanSession, scannedList, until } from '../helpers.mjs'

/**
 * B9-35 (SSP-12): a toast that arrives while the Price keypad is open, shown through the app's own toast API (the ToastProvider's context value,
 * found from the always-mounted .toast-region up its React fibers). Scan holds the toasts while the keypad is open, so none may be on screen
 * (and P43 finds a toast over the [data-pricing] row, which the probe reads for this scenario). False when the API is not found.
 */
const SHOW_TOAST_WHILE_PRICING = `(() => {
  const region = document.querySelector('.toast-region')
  const key = region && Object.keys(region).find((k) => k.startsWith('__reactFiber$'))
  for (let f = key ? region[key] : null; f; f = f.return) {
    const api = f.memoizedProps && f.memoizedProps.value
    if (!api || typeof api.show !== 'function' || typeof api.hold !== 'function') continue
    api.show({ title: 'Added Passata', actions: [{ label: 'Undo', ariaLabel: 'Undo: Added Passata', role: 'undo', onClick: () => {} }] })
    return true
  }
  return false
})()`

export default {
  order: 40,
  scenarios: [
    { name: 'scan-scanned-list', route: '/scan', start: '/scan', setup: 'scanScannedList', widths: [375, 390, 834] },
    { name: 'scan-row-active', route: '/scan', start: '/scan', setup: 'scanRowActive', widths: [375, 390, 834] },
    { name: 'scan-price-keypad', route: '/scan', start: '/scan', setup: 'scanPriceKeypad', widths: [375, 390, 834] },
    { name: 'scan-new-product', route: '/scan', start: '/scan', setup: 'scanNewProduct', widths: [375, 390, 834] },
  ],
  setups: {
    async scanScannedList() {
      await scannedList()
    },
    async scanRowActive() {
      await scannedList()
      await press(`document.querySelector('ul[aria-label="Scanned list"] > .list-row .list-row__target')`, 'the first Scanned row')
      await until(`!!document.querySelector('.scanned-row__strip')`, 'the active row strip')
    },
    async scanPriceKeypad() {
      await scannedList()
      await press(`document.querySelector('ul[aria-label="Scanned list"] > .list-row .list-row__target')`, 'the first Scanned row')
      await until(`!!document.querySelector('.scanned-row__strip')`, 'the active row strip')
      await press(byText('.scanned-row__strip button', 'Price'), 'Price on the active row')
      await until(`document.querySelector('.scan-screen')?.dataset.priceEntry === 'open' && !!document.querySelector('dialog.sheet[open]')`, 'the Price keypad')
      // SSP-12: a toast that arrives now must not show over the row being priced (P43 reads the toasts and [data-pricing] on this scenario).
      if (!(await evaluate(SHOW_TOAST_WHILE_PRICING))) throw new Error("setup: not inspected: the app's toast API (the ToastProvider above .toast-region) was not found")
      // a toast that is held is not on screen; one that is, is reported by P43 when it covers [data-pricing] (the probe runs after the setup)
      await evaluate(`new Promise((r) => setTimeout(r, 600))`)
    },
    async scanNewProduct() {
      await scanSession([ids.unknownBarcode])
      await until(`!!document.querySelector('dialog.sheet[open]')`, 'the new-Product sheet')
    },
  },
}
