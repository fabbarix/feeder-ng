// B9-20 (RES-02, RES-06; plan sections 3 and 9): the scenarios of "unknown is not empty" and "errors in about 1 s".
//   offline-unknown   Today is loaded, then the phone loses its signal (navigator.onLine false, the offline event, every request fails) and
//                     /recipes, /pantry, /plan and /recipes/:id are opened in the app. Each must show one .load-state and no .empty-state
//                     and no text matching /match|Nothing in/ (the setup throws otherwise, so the probes do not inspect: the run fails).
//                     The page measured is the last one, the Recipe detail.
//   error-state-fast  Today is loaded, then every /api/recipes request answers 500 and /recipes is opened in the app: an .error-state with
//                     a Try again button shows within 2.5 s (the retry policy: one retry after 1 s).
// Both go through page code only (the driver's helpers have no network control): the page's own fetch and navigator are replaced.
import { until } from '../helpers.mjs'

const GO_OFFLINE = `(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
  window.fetch = () => Promise.reject(new TypeError('Failed to fetch'))
  window.dispatchEvent(new Event('offline'))
  return true
})()`

/** Opens a path in the running app: the link in the navigation when there is one, else a history push the router hears. */
const openInApp = (path) => `(() => {
  const link = [...document.querySelectorAll('a[href]')].find((a) => a.getAttribute('href') === ${JSON.stringify(path)})
  if (link) link.click()
  else { history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate')) }
  return location.pathname
})()`

const LOADED = `!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`

export default {
  order: 400,
  scenarios: [
    { name: 'offline-unknown', route: '/', start: '/', setup: 'offlineUnknown', widths: [390, 1440] },
    { name: 'error-state-fast', route: '/', start: '/', setup: 'errorStateFast', widths: [390] },
  ],
  setups: {
    async offlineUnknown(h) {
      await until(LOADED, 'Today loaded')
      await h.evaluate(GO_OFFLINE)
      const ids = h.ids ?? {}
      for (const path of ['/recipes', '/pantry', '/plan', `/recipes/${ids.recipeId ?? 1}`]) {
        await h.evaluate(openInApp(path))
        await until(`location.pathname === ${JSON.stringify(path)} && document.querySelectorAll('.load-state').length === 1`, `${path} showing one LoadState`)
        const bad = await h.evaluate(`(() => {
          const main = document.querySelector('main') ?? document.body
          if (main.querySelector('.empty-state')) return 'an .empty-state'
          if (main.querySelector('.error-state, [role="alert"]')) return 'an error state'
          const m = /\\bmatch(es)?\\b|Nothing in/i.exec(main.textContent ?? '')
          return m ? 'the text "' + m[0] + '"' : ''
        })()`)
        if (bad) throw new Error(`setup: ${path} offline and never loaded shows ${bad} (unknown is not empty)`)
      }
    },
    async errorStateFast(h) {
      await until(LOADED, 'Today loaded')
      await h.evaluate(`(() => {
        const real = window.fetch.bind(window)
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : input.url
          return /\\/api\\/recipes(\\?|$|\\/)/.test(url)
            ? Promise.resolve(new Response(JSON.stringify({ error: { code: 'internal', message: 'boom' } }), { status: 500, headers: { 'Content-Type': 'application/json' } }))
            : real(input, init)
        }
        return true
      })()`)
      await h.evaluate(openInApp('/recipes'))
      await until(`location.pathname === '/recipes' && !!document.querySelector('.error-state') && [...document.querySelectorAll('.error-state button')].some((b) => b.textContent.trim() === 'Try again')`, 'the error state with Try again within 2.5 s', 2500)
    },
  },
}
