// beta.7 (RR5, docs/design/receipt-reading.md 9): the photos screen with no photo, with one, its photo edit sheet, and the review
// of a done read (the fake Anthropic API answers the read; internal/recipeassistant/fakeanthropic receipt.go).
import { byText, press, receiptPhotos, until } from '../helpers.mjs'

export default {
  order: 50,
  scenarios: [
    { name: 'receipt-photos-empty', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotosEmpty', widths: [360, 390, 834, 1440] },
    { name: 'receipt-photos-one', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotosOne', widths: [360, 390, 834, 1440] },
    { name: 'receipt-photo-edit', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotoEdit', widths: [360, 390, 834, 1440] },
    { name: 'receipt-review', route: '/scan/receipt/review', start: '/scan', setup: 'receiptReview', widths: [360, 390, 834, 1440] },
  ],
  setups: {
    receiptPhotosEmpty: () => receiptPhotos(0),
    receiptPhotosOne: () => receiptPhotos(1),
    async receiptPhotoEdit() {
      await receiptPhotos(1)
      await press(`document.querySelector('.receipt-photos button[aria-label="Edit photo 1"]')`, '"Edit photo 1"')
      await until(`!!document.querySelector('dialog[open]')`, 'the photo edit sheet')
    },
    async receiptReview() {
      await receiptPhotos(1)
      await press(byText('.sticky-action-bar button', 'Read the receipt'), '"Read the receipt" in the action bar')
      await until(`location.pathname === '/scan/receipt/review'`, 'the review (a done read)', 30000)
      await until(`!!document.querySelector('main h1') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the review content')
    },
  },
}
