// B9-41 (SSP-07, SSP-20; plan section 9, the `scanWeighed` setup): the scenario of a new weighed Product.
//   scan-weighed   /scan: the seeded Weight Barcode Rule's code (item 00123, 312 g) is typed. The setup walks it and throws, with the reason, when
//                  - the "What is this?" header is not "312 g · weighed at <Shop> · item 00123" (SSP-07), or the sheet shows the barcode line or
//                    the 14 digits nobody typed (SSP-20);
//                  - after Add the Price keypad does not open on per kg, has a header Close (R-B), or shows no "× 312 g = $4.65" under a typed
//                    $14.90 (SSP-07);
//                  - the focus ring of a keypad key is not drawn inside the key (R-C+: outline-offset -2 px at least as deep as the outline).
//                  P12, P23 (the row's meta) and P43 (no toast over the row being priced) read the screen at 375, 390 and 834 at the end.
// The first open Line chip is the Ingredient (a weighed code lists the Lines in g first); the setup fails when the sheet has no Line chip.
import { byText, evaluate, ids, press, scanSession, until } from '../helpers.mjs'

const SHEET = `document.querySelector('dialog.sheet[open]')`
const KEYPAD = `document.querySelector('dialog.sheet[open] .price-keypad')`

export default {
  order: 341,
  scenarios: [{ name: 'scan-weighed', route: '/scan', start: '/scan', setup: 'scanWeighed', widths: [375, 390, 834], rules: ['P12', 'P23', 'P43'] }],
  setups: {
    async scanWeighed() {
      if (!ids.weighedBarcode) throw new Error('setup: not inspected: the seed has no weighed barcode (the Weight Barcode Rule was not made)')
      await scanSession([ids.weighedBarcode])
      await until(`!!${SHEET}?.querySelector('form')`, 'the "What is this?" sheet of the weighed code')
      const text = await evaluate(`(${SHEET}.querySelector('form').innerText || '').replace(/\\s+/g, ' ')`)
      if (!/\d[\d.,]* ?(g|kg|oz|lb) · weighed at .+ · item \d+/.test(text)) throw new Error(`SSP-07: the sheet's header line is not "<weight> · weighed at <Shop> · item <code>": "${text.slice(0, 120)}"`)
      if (/not in Feeder yet/.test(text)) throw new Error('SSP-07: a weighed code shows the barcode line ("not in Feeder yet") instead of the weighed header')
      if (/\b0\d{13}\b/.test(text)) throw new Error('SSP-20: the sheet shows 14 digits nobody typed')
      // the first Line chip is the Ingredient
      await press(`[...document.querySelectorAll('dialog.sheet[open] .new-product__chips .choice-chip')].find((c) => c.dataset.variant === 'filled')`, 'a Line chip in "Which Line is it?" (the seeded Shopping List has open Lines)')
      await until(`!!${SHEET}?.querySelector('form button[type=submit]')`, 'the Add button')
      await press(`${SHEET}.querySelector('form button[type=submit]')`, 'Add')
      await until(`document.querySelector('.scan-screen')?.dataset.priceEntry === 'open' && !!${KEYPAD}`, 'the Price keypad on the new row')
      const perKg = await evaluate(`[...${KEYPAD}.querySelectorAll('[role=radio]')].some((r) => r.textContent.trim() === 'per kg' && r.getAttribute('aria-checked') === 'true')`)
      if (!perKg) throw new Error('SSP-07: the Price keypad of a new weighed Product does not open on per kg')
      if (await evaluate(`!!${SHEET}.querySelector('.sheet__header button')`)) throw new Error('SSP-07 (R-B): the Price keypad has a Close in its header; its footer has Close')
      for (const key of ['1', '4', 'Decimal separator', '9', '0']) await press(byText('.price-keypad__key', key), `key ${key}`)
      const implied = await evaluate(`(document.querySelector('.price-keypad__implied')?.textContent || '').replace(/\\s+/g, ' ').trim()`)
      if (!/^× \d+ g = \$\d/.test(implied)) throw new Error(`SSP-07: under the typed Price the keypad does not say what the weight costs ("× 312 g = $4.65"): "${implied}"`)
      // R-C+: the focused key's ring is drawn inside the key (the keys are 8 px apart)
      const ring = await evaluate(`(() => {
        for (const sheet of document.styleSheets) {
          let rules
          try { rules = sheet.cssRules } catch { continue }
          for (const r of rules) if (r.selectorText && /\\.price-keypad__key:focus-visible/.test(r.selectorText)) return { width: parseFloat(r.style.outlineWidth || r.style.outline) || 0, offset: parseFloat(r.style.outlineOffset) }
        }
        return null
      })()`)
      if (!ring) throw new Error('SSP-07 (R-C+): no .price-keypad__key:focus-visible rule: a focused key has the page ring, which overlaps the next key')
      if (!(ring.offset <= -ring.width) || ring.width < 2) throw new Error(`SSP-07 (R-C+): the focused key's ring (${ring.width}px at offset ${ring.offset}px) is not drawn inside the key`)
      await evaluate(`document.querySelectorAll('.toast > button:last-child').forEach((b) => b.click())`)
    },
  },
}
