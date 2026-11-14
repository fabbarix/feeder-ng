// beta.7 (H8): the Shop list with its Supplies group (the seeded Supply below its Restock level). b8-shop (docs/dev/design/b8-shop.md 1
// and 2): the header chips at the phone widths (their icons stay, the values are short), and the Shop's info hints in the card grid,
// which P23 reads for a cut hint (the hint pinned to its worst case: helpers.mjs PIN_WORST_HINT).
import { pinWorstHint, until } from '../helpers.mjs'

export default {
  order: 30,
  scenarios: [
    { name: 'shop-supplies-group', route: '/shop', start: '/shop', setup: 'shopSuppliesGroup', widths: [375, 390, 834, 1440] },
    { name: 'shop-header', route: '/shop', start: '/shop', setup: 'shopHeader', widths: [375, 390] },
    { name: 'shop-hints', route: '/shop', start: '/shop', setup: 'shopHints', widths: [375, 390, 834, 1440] },
  ],
  setups: {
    // b8-polish (P23): a Restock reason in the Supplies group ("400/1000 ml" on a phone), so the probe reads the Supplies group too.
    async shopSuppliesGroup() {
      await until(`!!document.querySelector('.shop-supplies .list-row__meta[data-status="info"]')`, 'a Restock reason in the Supplies group of the Shop list (a Supply below its Restock level)')
    },
    // b8-shop: the header chips (the Shop for and the Shop pickers) shown, the list loaded.
    async shopHeader() {
      await until(`document.querySelectorAll('.shop-screen__controls .select__trigger[data-appearance="chip"]').length >= 2 && !document.querySelector('.skeleton')`, 'the Shop header chips')
    },
    // b8-shop (P23): a seeded Meal Slot hint on a food Line ("Fri Dinner +2", the seeder's Planned Meals not marked Cooked yet), so the
    // probe measures a real Shop hint (the Supplies group's Restock reason alone would leave P23 nothing to read).
    async shopHints() {
      await until(`!!document.querySelector('.shop-open .shop-lines .list-row__meta[data-status="info"]')`, 'a Meal Slot hint on a food Line of the Shop list')
      await pinWorstHint()
    },
  },
}
