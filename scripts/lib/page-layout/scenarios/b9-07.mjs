// B9-07 (DS-09, A11Y-02; plan section 9): the scenarios of P26 and P39.
//   today-columns            Today, walked from 900 to 1320 px inside the page (probes/bento-walk.mjs); only P26 reports there.
//   focus-ring-room-today    Today with its hero (Cook, the menu), every control focused in turn (probes/focus-rings.mjs); P39 only.
//   focus-ring-room-fields   the Recipe editor (field frames, the Yield stepper, the ingredient search); P39 only.
import { until } from '../helpers.mjs'

export default {
  order: 300,
  scenarios: [
    { name: 'today-columns', route: '/', start: '/', setup: 'todayLoaded', widths: [1440], rules: ['P26'] },
    { name: 'focus-ring-room-today', route: '/', start: '/', setup: 'todayLoaded', widths: [390, 1440], rules: ['P39'] },
    { name: 'focus-ring-room-fields', route: '/recipes/new', start: '/recipes/new', setup: 'recipeEditorLoaded', widths: [390, 1440], rules: ['P39'] },
  ],
  setups: {
    async todayLoaded() {
      await until(`!!document.querySelector('main .bento-grid') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Today grid')
    },
    async recipeEditorLoaded() {
      await until(`!!document.querySelector('main .ui-field__control') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Recipe editor fields')
    },
  },
}
