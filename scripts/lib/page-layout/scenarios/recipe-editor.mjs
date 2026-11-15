// B9-10 (DS-04, docs/design/ui-review-3/ds.md): the Recipe editor of a Recipe that carries the 36-character Tag, at the smallest widths.
// The seed (scripts/test/fixtures/page-layout-seed/recipe-editor.mjs) adds LONG_TAG to the seeded Recipe, so its Tag field holds a
// selected chip that is wider than the 288 px column at 320 and than the field at 375. P1 (sideways scroll) and P13 (a box wider than its
// tile) catch the chip running past the field; the unit test recipes/sweep.b9-10.css.test.ts pins the CSS (`.tag-input` track and cap).
import { evaluate, press, until } from '../helpers.mjs'

export default {
  order: 40,
  scenarios: [{ name: 'recipe-editor-long-tag', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorLongTag', widths: [375, 390] }],
  setups: {
    async recipeEditorLongTag() {
      // B9-37 (RX-09): the Tags are removable chips in the closed Planning section; open it, then wait for the chip of the long Tag.
      await until(`!!document.querySelector('#recipe-section-planning button[aria-expanded]') && !document.querySelector('.skeleton, [aria-busy="true"]')`, 'the editor with its Planning section')
      if (await evaluate(`document.querySelector('#recipe-section-planning button[aria-expanded]').getAttribute('aria-expanded') === 'false'`)) {
        await press(`document.querySelector('#recipe-section-planning button[aria-expanded]')`, 'the Planning heading')
      }
      await until(`!!document.querySelector('.tag-chooser .chip')`, 'the editor with its Tag chip')
    },
  },
}
