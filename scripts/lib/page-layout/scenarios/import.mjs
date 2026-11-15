// B9-28 (RX-01, RX-11; plan section 9): the Import screens, driven through the UI with a small Recipe File of two Recipes.
//   import-review  /recipes/import with the file reviewed, at 375, 390 and 1440. The setup checks what the chapter's guard asks:
//                  every recipes[].name of the file is in the page while reviewing, and the "Import actions" bar is one row (its buttons
//                  share a top). "Import guard stew" also exists in the seed, so its row asks Replace, Keep both or Skip.
//   import-result  the same file imported ("Import guard stew" kept both), at 390: every Recipe name is in the page after the import,
//                  and each has its link and its Edit button. It adds two Recipes and one Ingredient to the guard's household, so it runs
//                  late (order 410) and at one width only.
// The setups throw when a step does not show, so the page-layout probes are never run on the wrong page.
import { evaluate, js, press, byText, until } from '../helpers.mjs'

const NAMES = ['Import guard soup', 'Import guard stew']
const FILE = JSON.stringify({
  format: 'feeder-recipe-file', version: 1,
  ingredients: [{ name: 'import guard leek', baseUnit: 'g' }],
  recipes: [
    { name: NAMES[0], yield: 2, courses: ['Main'], ingredients: [{ ingredient: 'import guard leek', quantity: 300, unit: 'g' }], steps: [{ text: 'Simmer the leek.', kind: 'passive', durationMinutes: 20 }] },
    { name: NAMES[1], yield: 4, courses: ['Main'], ingredients: [{ ingredient: 'import guard leek', quantity: 500, unit: 'g' }], steps: [{ text: 'Stew it slowly.', kind: 'passive', durationMinutes: 90 }] },
  ],
})

const namesShown = (names) => `(() => { const t = document.querySelector('main')?.textContent ?? ''; return ${js(names)}.every((n) => t.includes(n)) })()`

async function reviewTheFile() {
  await until(`!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Import screen')
  await press(byText('main button', 'Paste the JSON instead'), '"Paste the JSON instead" button')
  await until(`!!document.querySelector('main textarea')`, 'the JSON field')
  await evaluate(`(() => { const e = document.querySelector('main textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(e, ${js(FILE)}); e.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await press(byText('main button', 'Review'), '"Review" button')
  await until(`[...document.querySelectorAll('main h2')].some((h) => h.textContent.trim() === 'Recipes')`, 'the Recipes tile of the review')
}

export default {
  order: 410,
  scenarios: [
    { name: 'import-review', route: '/recipes/import', start: '/recipes/import', setup: 'importReview', widths: [375, 390, 1440] },
    { name: 'import-result', route: '/recipes/import', start: '/recipes/import', setup: 'importResult', widths: [390] },
  ],
  setups: {
    async importReview() {
      await reviewTheFile()
      if (!(await evaluate(namesShown(NAMES)))) throw new Error(`setup: not every Recipe of the file (${NAMES.join(', ')}) is in the review`)
      const bar = await evaluate(`(() => {
        const b = document.querySelector('[aria-label="Import actions"]')
        if (!b) return null
        const tops = [...b.querySelectorAll('button, a')].map((e) => Math.round(e.getBoundingClientRect().top))
        return { n: tops.length, spread: Math.max(...tops) - Math.min(...tops) }
      })()`)
      if (!bar || bar.n < 1) throw new Error('setup: no "Import actions" bar with buttons in the review')
      if (bar.spread > 4) throw new Error(`setup: the Import actions bar is not one row (its buttons' tops differ by ${bar.spread} px)`)
    },
    async importResult() {
      await reviewTheFile()
      await press(byText('main [aria-label="What to do with Import guard stew"] button', 'Keep both'), '"Keep both" of the existing Recipe')
      await until(`!!document.querySelector('[aria-label="Import actions"] button[data-variant="primary"]:not([disabled])') && /^Import 2 Recipes$/.test(document.querySelector('[aria-label="Import actions"] button[data-variant="primary"]')?.textContent.trim() ?? '')`, 'the Import button, with the question answered')
      await press(`document.querySelector('[aria-label="Import actions"] button[data-variant="primary"]')`, '"Import 2 Recipes" button')
      await until(`[...document.querySelectorAll('main h2, main h1')].some((h) => h.textContent.trim() === 'Imported 2 Recipes')`, 'the import result')
      if (!(await evaluate(namesShown(NAMES)))) throw new Error('setup: the import result does not name every Recipe of the file')
      const edits = await evaluate(`[...document.querySelectorAll('main a')].filter((a) => /^Edit /.test(a.getAttribute('aria-label') ?? a.textContent.trim())).length`)
      if (edits !== 2) throw new Error(`setup: the result has ${edits} Edit buttons, want 2 (one per Recipe)`)
    },
  },
}
