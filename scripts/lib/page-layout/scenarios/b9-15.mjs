// B9-15 (SET-06, SET-01; plan section 9): the scenarios of the crafted Select, each run with P17 (a chip line's fit) and P18 (a clipped ring)
// inside the open Select, at the widths the chapter names (A1: 375 replaces 320).
//   planning-recipe-select   Settings > Planning: the Recipe Select of the Slot Rule form, open, with its search focused (a sheet below
//                            768 px, a popover above): one chip line, two-line options, the search field's ring in full.
//   shop-barcode-sheet       (held for B9-30, see B9_15_DEFERRED) the Shop page: the Add Shop Barcode sheet open with its Product Select open on top (SET-01 rebuilds the sheet on the
//                            crafted Select, B9-30); no sideways scroll and the Select's ring in full.
// Both pages must show their open Select before the probes run, or the setup throws and the scenario is not inspected (and fails).
import { byText, evaluate, press, until } from '../helpers.mjs'

const B9_15 = [
  { name: 'planning-recipe-select', route: '/settings/planning', start: '/settings/planning', setup: 'planningRecipeSelectOpen', widths: [375, 390, 834, 1440], rules: ['P17', 'P18', 'P1'] },
  { name: 'shop-barcode-sheet', route: '/settings/shops/:id', start: '/settings/shops/:id', setup: 'shopBarcodeSheetOpen', widths: [375, 390, 834, 1440], rules: ['P17', 'P18', 'P1'] },
]

/**
 * Held until its owner builds the screen it needs (as font-24 held a route). B9-15 developer: today's Add Shop Barcode sheet has a
 * SearchField and Product chips, and a (rule) Select only when the Shop has a Weight Barcode Rule, which the seeded Shop has not; so the
 * setup cannot find a Select and the scenario cannot pass. B9-30 (SET-01) rebuilds the sheet on a Product Select: it deletes this entry
 * (and adds the name back to ADDED.scenarios in web/src/app/pageLayoutRegistry.test.ts).
 */
export const B9_15_DEFERRED = { 'shop-barcode-sheet': 'B9-30' }
/** The deferred scenarios, defined in full with their owner. */
export const B9_15_DEFERRED_SCENARIOS = B9_15.filter((s) => B9_15_DEFERRED[s.name]).map((s) => ({ ...s, owner: B9_15_DEFERRED[s.name] }))

export default {
  order: 315,
  scenarios: B9_15.filter((s) => !B9_15_DEFERRED[s.name]),
  setups: {
    async planningRecipeSelectOpen() {
      await until(`!!document.querySelector('main [role="combobox"]') && !document.querySelector('.skeleton, [aria-busy="true"]')`, 'the Planning rules with the Slot Rule form')
      await press(`[...document.querySelectorAll('main button[role="combobox"]')].find((b) => b.getAttribute('aria-label') === 'Recipe' || b.getAttribute('aria-labelledby') && document.getElementById(b.getAttribute('aria-labelledby'))?.textContent.trim() === 'Recipe')`, 'the Recipe Select')
      await until(`!!document.querySelector('[role="listbox"] [role="option"]')`, 'the open Recipe list')
    },
    async shopBarcodeSheetOpen() {
      await until(`!!document.querySelector('main') && !document.querySelector('.skeleton, [aria-busy="true"]')`, 'the Shop page')
      await press(byText('main button', 'Add Shop Barcode'), '"Add Shop Barcode"')
      await until(`!!document.querySelector('dialog[open] [role="combobox"], dialog[open] input[role="combobox"]')`, 'the Add Shop Barcode sheet with its Product Select')
      if (await evaluate(`!!document.querySelector('dialog[open] button[role="combobox"]')`)) {
        await press(`document.querySelector('dialog[open] button[role="combobox"]')`, 'the Product Select')
        await until(`!!document.querySelector('[role="listbox"]')`, 'the open Product list')
      }
    },
  },
}
