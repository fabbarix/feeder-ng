// beta.7 (H8, docs/dev/design/household-items.md 8): the Supplies list with the quick-Use sheet of a g or ml Supply open, and the
// Supply page.
import { press, until } from '../helpers.mjs'

export default {
  order: 20,
  scenarios: [
    { name: 'supplies-use-sheet', route: '/supplies', start: '/supplies', setup: 'supplyUseSheet', widths: [360, 390, 834, 1440] },
    { name: 'supply-page', route: '/supplies/:id', start: '/supplies/:id', setup: 'supplyPage', widths: [360, 390, 834, 1440] },
  ],
  setups: {
    async supplyUseSheet() {
      await until(`!!document.querySelector('ul[aria-label="Supplies"] .list-row')`, 'the Supplies list')
      // The first seeded Supply is the ml one below its Restock level: its Use opens the "how much" sheet.
      await until(`!![...document.querySelectorAll('.list-row')].find((r) => r.querySelector('.list-row__title')?.textContent.trim() === 'Washing-up liquid')?.querySelector('.list-row__trailing button:not(:disabled)')`, 'an enabled Use on Washing-up liquid')
      await press(`[...document.querySelectorAll('.list-row')].find((r) => r.querySelector('.list-row__title')?.textContent.trim() === 'Washing-up liquid')?.querySelector('.list-row__trailing button')`, 'Use on Washing-up liquid')
      await until(`!!document.querySelector('dialog.sheet[open]')`, 'the quick-Use sheet')
    },
    async supplyPage() {
      await until(`!!document.querySelector('main h1') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Supply page')
    },
  },
}
