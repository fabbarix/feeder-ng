// B9-19 (DS-02, SHORT-04, SHORT-05, SHORT-08; plan section 9): the scenarios of P31, P32 and P35.
//   bottom-bar               Today at 375, 390 and 430 px: the bar's current page and Scan are 40 px squircles inside the bar (P31). At 375 the bar
//                            shows icons only (amendment A1), above it icon and label.
//   chrome-landscape         Today in a phone held sideways (667x375): the compact rail, no bottom bar, chrome budget (P32).
//   chrome-landscape-editor  the Recipe editor at 667x375: one 62 px Save bar only (P32).
//   chrome-landscape-detail  Recipe detail at 667x375: the Cook bar only (P32).
//   chrome-zoom-editor/-detail  the same pages at 375x256 (400 % zoom): both bars in flow, nothing fixed over the content (P32).
//   safe-gutters-today/-shop Today and Shop at 844x390 with 47 px side insets: no content in an inset (P35).
import { until } from '../helpers.mjs'

const noSkeleton = `!document.querySelector('[aria-busy="true"], .skeleton')`

export default {
  order: 330,
  scenarios: [
    { name: 'bottom-bar', route: '/', start: '/', setup: 'shellChromeToday', widths: [375, 390, 430], rules: ['P31'] },
    { name: 'chrome-landscape', route: '/', start: '/', setup: 'shellChromeToday', widths: ['667x375'], rules: ['P32'] },
    { name: 'chrome-landscape-editor', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'shellChromeEditor', widths: ['667x375'], rules: ['P32'] },
    { name: 'chrome-landscape-detail', route: '/recipes/:id', start: '/recipes/:id', setup: 'shellChromeDetail', widths: ['667x375'], rules: ['P32'] },
    { name: 'chrome-zoom-editor', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'shellChromeEditor', widths: ['375x256'], rules: ['P32'] },
    { name: 'chrome-zoom-detail', route: '/recipes/:id', start: '/recipes/:id', setup: 'shellChromeDetail', widths: ['375x256'], rules: ['P32'] },
    { name: 'safe-gutters-today', route: '/', start: '/', setup: 'shellChromeToday', widths: ['844x390-inset'], rules: ['P35'] },
    { name: 'safe-gutters-shop', route: '/shop', start: '/shop', setup: 'shellChromeShop', widths: ['844x390-inset'], rules: ['P35'] },
  ],
  setups: {
    async shellChromeToday() {
      await until(`!!document.querySelector('main .bento-grid') && ${noSkeleton}`, 'the Today grid')
    },
    async shellChromeShop() {
      await until(`!!document.querySelector('main h1') && ${noSkeleton}`, 'the Shop page')
    },
    async shellChromeEditor() {
      await until(`!!document.querySelector('main .ui-field__control') && !!document.querySelector('.sticky-action-bar') && ${noSkeleton}`, 'the Recipe editor and its Save bar')
    },
    async shellChromeDetail() {
      await until(`!!document.querySelector('main h1') && !!document.querySelector('.sticky-action-bar') && ${noSkeleton}`, 'Recipe detail and its Cook bar')
    },
  },
}
