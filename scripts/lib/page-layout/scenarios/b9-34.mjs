// B9-34 (SSP-01, SSP-02, SSP-18, A11Y-07; plan sections 6 and 9): the scenarios of the Shop's ticking.
//   shop-ticked            /shop with ticked Lines of every kind the seed has (a hand tick that added Stock, one that added none; a Scan tick and
//                          a "more since your tick" row when the seed has them): P23 reads every row's one meta line (probes/cut-meta.mjs is
//                          widened by this package to all `.shop-lines .list-row__meta`, not only the info ones), at 375, 390, 834 and 1440
//                          (the Shop's two-column card grid, SSP-05). The setup throws when there is no ticked row, so a run on an
//                          unseeded server does not pass empty.
//   shop-focus-after-tick  /shop: the first open row's tick is focused and pressed with the keyboard (Enter); focus must land on the next
//                          row's tick (A11Y-07), never <body>; then Undo in the toast (Ctrl+Z is the toast's key) puts the row back and
//                          focus returns to that row's tick. The setup throws when focus rests on <body>, so the run fails with the reason.
//                          Only P23 is reported there (rules: ['P23']); the point is the setup's own assertions.
// The row selectors are the app's: `.shop-lines .list-row[data-state]`, the tick `.line-row__tick`, `.toast`.
import { evaluate, press, until } from '../helpers.mjs'

const TICKED_META = `document.querySelectorAll('.shop-ticked .list-row[data-state="ticked"] .list-row__meta').length`
const FOCUSED = `(() => { const a = document.activeElement; return a && a !== document.body ? (a.getAttribute('aria-label') || a.tagName) : '' })()`

export default {
  order: 340,
  scenarios: [
    { name: 'shop-ticked', route: '/shop', start: '/shop', setup: 'shopTicked', widths: [375, 390, 834, 1440], rules: ['P23'] },
    { name: 'shop-focus-after-tick', route: '/shop', start: '/shop', setup: 'shopFocusAfterTick', widths: [390, 1440], rules: ['P23'] },
  ],
  setups: {
    async shopTicked() {
      await until(`${TICKED_META} >= 1`, 'a ticked Line with a meta line in the Ticked group (the seed ticks two Lines: shop-ticked needs a seeded server)')
      // the success meta and the muted one are both there when the seed made both kinds
      const kinds = await evaluate(`[...document.querySelectorAll('.shop-ticked .list-row__meta')].map((m) => m.dataset.status || 'muted')`)
      if (!kinds.includes('success')) throw new Error('setup: not inspected: no hand tick that added Stock ("+… in Stock") in the Ticked group')
    },
    async shopFocusAfterTick() {
      await until(`document.querySelectorAll('.shop-open .list-row .line-row__tick').length >= 2`, 'at least two open rows with a tick')
      const first = `document.querySelectorAll('.shop-open .list-row .line-row__tick')[0]`
      const second = `document.querySelectorAll('.shop-open .list-row .line-row__tick')[1]`
      const name = await evaluate(`${second}.getAttribute('aria-label')`)
      const firstName = await evaluate(`${first}.getAttribute('aria-label')`)
      await evaluate(`${first}.focus()`)
      await press(first, `the first tick (${firstName}) with the keyboard`)
      await until(`!!document.querySelector('.toast')`, 'the tick toast', 4000)
      await until(`document.activeElement && document.activeElement !== document.body`, 'focus off <body> after the tick', 2000).catch(() => {
        throw new Error(`setup: A11Y-07: after ticking "${firstName}" focus is on <body>; it must go to the next row's tick ("${name}")`)
      })
      const landed = await evaluate(FOCUSED)
      if (landed !== name) throw new Error(`setup: A11Y-07: after ticking "${firstName}" focus is on "${landed}", not the next row's tick "${name}"`)
      // Undo puts the row back and focuses it (the toast's Undo button)
      await press(`[...document.querySelectorAll('.toast button')].find((b) => /^Undo/.test(b.getAttribute('aria-label') || b.textContent.trim()))`, 'Undo in the toast')
      await until(`document.activeElement && document.activeElement.getAttribute('aria-label') === ${JSON.stringify(firstName)}`, `focus back on "${firstName}" after Undo`, 4000)
    },
  },
}
