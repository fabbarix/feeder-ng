// B9-18 (SAFE R1, SSP-12; plan section 9): the scenarios of P43 (a toast covers the row being acted on, the bottom bar or a sticky bar).
//   toast-pricing   /scan with the Price keypad open on a Scanned row: no .toast box may meet the [data-pricing] row (SSP-12: toasts are held
//                   while the keypad is open). The session's own toasts have gone by then, so the setup shows two fresh ones through the
//                   app's own toast API while the keypad is open: an "Added … Undo" (held once Scan holds, B9-35) and an error (never held).
//                   With no toast visible when the probe runs the setup throws, so the scenario is not inspected instead of passing empty.
//   toast-over-bar  /scan right after a typed scan, its "Added … Undo" toast on screen: it sits clear of the bottom bar (the Scan button
//                   included) at the phone widths and of the focused row on the tablet.
// Both only report P43 (probes/toast-cover.mjs fills `toastCover`).
import { SCANNED_UL, byText, evaluate, ids, press, scannedList, typeInto, until } from '../helpers.mjs'

/** Any .toast with a box and not hidden. */
const VISIBLE_TOAST = `[...document.querySelectorAll('.toast')].some((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' })`

/**
 * Shows, through the app's own toast API, what Scan would show while the keypad is open: an "Added … Undo" toast (an ordinary
 * Scan result; Scan holds it once B9-35 calls hold()) and an error (hold() never holds one). The API is the ToastProvider's context
 * value, found from the always-mounted .toast-region up its React fibers. False when it is not found.
 */
const SHOW_TOASTS_WHILE_PRICING = `(() => {
  const region = document.querySelector('.toast-region')
  const key = region && Object.keys(region).find((k) => k.startsWith('__reactFiber$'))
  for (let f = key ? region[key] : null; f; f = f.return) {
    const api = f.memoizedProps && f.memoizedProps.value
    if (!api || typeof api.show !== 'function' || typeof api.hold !== 'function') continue
    api.show({ title: 'Added Passata', actions: [{ label: 'Undo', ariaLabel: 'Undo: Added Passata', role: 'undo', onClick: () => {} }] })
    api.show({ status: 'error', title: 'Could not save the Price', body: 'Check the connection and try again.' })
    return true
  }
  return false
})()`

export default {
  order: 320,
  scenarios: [
    { name: 'toast-pricing', route: '/scan', start: '/scan', setup: 'toastPricing', widths: [375, 390, 834], rules: ['P43'] },
    { name: 'toast-over-bar', route: '/scan', start: '/scan', setup: 'toastOverBar', widths: [375, 390, 834], rules: ['P43'] },
  ],
  setups: {
    async toastPricing() {
      await scannedList()
      await press(`(${SCANNED_UL})?.querySelector(':scope > .list-row .list-row__target')`, 'the first Scanned row')
      await until(`!!document.querySelector('.scanned-row__strip')`, 'the active row strip')
      await press(byText('.scanned-row__strip button', 'Price'), 'Price on the active row')
      await until(`document.querySelector('.scan-screen')?.dataset.priceEntry === 'open' && !!document.querySelector('[data-pricing]')`, 'the Price keypad and the priced row')
      if (!(await evaluate(SHOW_TOASTS_WHILE_PRICING))) throw new Error('setup: not inspected: the app\'s toast API (the ToastProvider above .toast-region) was not found')
      await until(`${VISIBLE_TOAST} && document.querySelector('.scan-screen')?.dataset.priceEntry === 'open'`, 'not inspected: no toast on screen while the Price keypad is open', 2000)
    },
    async toastOverBar() {
      await scannedList()
      // the session's own Added toasts have gone by the time the list is ready: one more typed scan shows a fresh one
      const code = (ids.scanBarcodes ?? [])[0]
      if (!code) throw new Error('setup: the seed has no scan barcodes')
      // B9-35: the typed entry is open under the camera bar (no camera in a headless Chrome); with a camera it opens with "Type a barcode".
      if (!(await evaluate(`!!document.querySelector('[data-typed-entry] input')`))) await press(byText('button[aria-controls][aria-expanded]', 'Type a barcode'), '"Type a barcode"')
      await until(`!!document.querySelector('[data-typed-entry] input')`, 'the barcode field')
      if (!(await evaluate(typeInto('[data-typed-entry] input', code)))) throw new Error('setup: the barcode field went away')
      await press(`document.querySelector('[data-typed-entry] button[type=submit]')`, '"Use this barcode"')
      await until(`!!document.querySelector('.toast')`, 'the Added toast', 4000)
    },
  },
}
