// beta.7 (SR6, docs/design/shop-scan-proposals.md 13): the Scan screen in shop mode. A headless Chrome has no camera, so the
// no-camera block shows and the guard types the seeded codes by hand. The Scanned list with its rows and the "Read the receipt" footer
// row; a row active with its strip; the Price keypad (a non-modal half sheet on a phone, docked from 768 px); the new-Product sheet.
import { byText, ids, press, scanSession, scannedList, until } from '../helpers.mjs'

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
    },
    async scanNewProduct() {
      await scanSession([ids.unknownBarcode])
      await until(`!!document.querySelector('dialog.sheet[open]')`, 'the new-Product sheet')
    },
  },
}
