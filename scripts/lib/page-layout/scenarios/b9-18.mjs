// B9-18 (SAFE R1, SSP-12; plan section 9): the scenarios of P43 (a toast covers the row being acted on, the bottom bar or a sticky bar).
//   toast-pricing   /scan with the Price keypad open on a Scanned row: no .toast box may meet the [data-pricing] row (SSP-12: toasts are held
//                   while the keypad is open). The Scan that opened the keypad showed its "Added" toast moments before: it must be gone or held.
//   toast-over-bar  /scan right after a typed scan, its "Added … Undo" toast on screen: it sits clear of the bottom bar (the Scan button
//                   included) at the phone widths and of the focused row on the tablet.
// Both only report P43 (probes/toast-cover.mjs fills `toastCover`).
import { byText, press, scannedList, until } from '../helpers.mjs'

export default {
  order: 320,
  scenarios: [
    { name: 'toast-pricing', route: '/scan', start: '/scan', setup: 'toastPricing', widths: [375, 390, 834], rules: ['P43'] },
    { name: 'toast-over-bar', route: '/scan', start: '/scan', setup: 'toastOverBar', widths: [375, 390, 834], rules: ['P43'] },
  ],
  setups: {
    async toastPricing() {
      await scannedList()
      await press(`document.querySelector('ul[aria-label="Scanned list"] > .list-row .list-row__target')`, 'the first Scanned row')
      await until(`!!document.querySelector('.scanned-row__strip')`, 'the active row strip')
      await press(byText('.scanned-row__strip button', 'Price'), 'Price on the active row')
      await until(`document.querySelector('.scan-screen')?.dataset.priceEntry === 'open' && !!document.querySelector('[data-pricing]')`, 'the Price keypad and the priced row')
    },
    async toastOverBar() {
      await scannedList()
      await until(`!!document.querySelector('.toast')`, 'the Added toast')
    },
  },
}
