// B9-48 (SET-05, SAFE-02, SET-14e; plan section 9): the Ingredient and Supply pages.
//   ingredient-keeping       /ingredients/:id at 375, 834 and 1440: one full-width "Keeping" tile first, no half-width tile without a
//                            pair (the orphan from 760 px), and exactly one accent (primary) button on the page. The setup measures
//                            these itself, so the check holds whatever the rules say.
//   supply-keeping           the same for /supplies/:id.
//   ingredient-rename-sheet  the Rename sheet open at 375 and 834: sheet rules only.
//   ingredient-delete-confirm  Delete Ingredient's confirm open (More > Delete Ingredient) at 375 and 1440.
// The seeded Ingredient (ids.ingredientId) has no references, so Delete is enabled; the seeded Supply is ids.supplyId.
import { evaluate, js, press, until } from '../helpers.mjs'

const settled = `!document.querySelector('[aria-busy="true"], .skeleton')`

/** Page code: the tiles of the page's Bento grid and the checks of SET-05. */
const KEEPING_CHECKS = `(() => {
  const grid = document.querySelector('main .bento-grid')
  if (!grid) return 'no .bento-grid on the page'
  const tiles = [...grid.children].filter((e) => e.classList.contains('tile'))
  const first = tiles[0]
  if (!first || !/^Keeping$/.test(first.querySelector('h2')?.textContent.trim() ?? '')) return 'the first tile is not "Keeping"'
  if (first.getAttribute('data-span') !== 'full') return 'the Keeping tile is not full width'
  const halves = tiles.filter((t) => t.getAttribute('data-span') !== 'full')
  if (halves.length % 2 !== 0) return 'a half-width tile has no pair: ' + halves.map((t) => t.getAttribute('aria-label') || t.querySelector('h2')?.textContent).join(', ')
  const primaries = document.querySelectorAll('main [data-variant="primary"]').length
  if (primaries !== 1) return 'the page has ' + primaries + ' accent buttons, not 1'
  return ''
})()`

async function keepingLoaded() {
  await until(`!!document.querySelector('main .tile h2') && ${settled}`, 'the Keeping tile')
  const bad = await evaluate(KEEPING_CHECKS)
  if (bad) throw new Error(`setup: ${bad}`)
}

export default {
  order: 480,
  scenarios: [
    { name: 'ingredient-keeping', route: '/ingredients/:id', start: '/ingredients/:id', setup: 'ingredientKeeping', widths: [375, 834, 1440] },
    { name: 'supply-keeping', route: '/supplies/:id', start: '/supplies/:id', setup: 'supplyKeeping', widths: [375, 834, 1440] },
    { name: 'ingredient-rename-sheet', route: '/ingredients/:id', start: '/ingredients/:id', setup: 'renameSheet', widths: [375, 834], rules: ['P1', 'P8', 'P18', 'P25', 'P33'] },
    { name: 'ingredient-delete-confirm', route: '/ingredients/:id', start: '/ingredients/:id', setup: 'deleteConfirm', widths: [375, 1440], rules: ['P1', 'P8', 'P18'] },
  ],
  setups: {
    ingredientKeeping: keepingLoaded,
    supplyKeeping: keepingLoaded,
    async renameSheet() {
      await until(`!!document.querySelector('main .page-header__actions button') && ${settled}`, 'the page header actions')
      await press(`document.querySelector('main .page-header__actions button[aria-label^="Rename "]')`, 'Rename button')
      await until(`!!document.querySelector('dialog[open] input')`, 'the Rename sheet')
      // The Name field is focused with its text selected, and there is no Close (the footer has Cancel).
      const state = await evaluate(`(() => { const d = document.querySelector('dialog[open]'); const i = d.querySelector('input'); return { focused: document.activeElement === i, close: !!d.querySelector('button[aria-label="Close"]') } })()`)
      if (!state.focused) throw new Error(`setup: the Name field is not focused: ${js(state)}`)
      if (state.close) throw new Error('setup: the Rename sheet has a Close beside its Cancel')
    },
    async deleteConfirm() {
      await until(`!!document.querySelector('main .page-header__actions button[aria-label^="More for "]') && ${settled}`, 'the More button')
      await press(`document.querySelector('main .page-header__actions button[aria-label^="More for "]')`, 'More button')
      await until(`!!document.querySelector('[role="menuitem"][aria-disabled!="true"]')`, 'the More menu')
      await press(`[...document.querySelectorAll('[role="menuitem"]')].find((e) => /^Delete /.test(e.textContent.trim()))`, 'Delete menu item')
      await until(`!!document.querySelector('dialog[open] .confirm-dialog__note, dialog[open] .dialog__actions')`, 'the Delete confirm')
    },
  },
}
