// The `font-24` scenarios (DS-08, plan 3 section 9, owner B9-02): the routes read at a 24 px browser text size, set through CDP
// before the first navigation. P1 (no overflow) and P27 (role census, heading order) run there; the census probe is
// probes/p27-census.mjs. `FONT_24` is the definition (tested by web/src/app/pageLayoutRules.p27.test.ts); the default export is
// the registry's shape (w0b integration): one scenario per route, `font-24-<slug>`.
export const FONT_24 = {
  name: 'font-24',
  fontSizePx: 24,
  routes: ['/', '/shop', '/settings/shops/:id', '/recipes/:id'],
  widths: [390, 1440],
  cdp: { method: 'Page.setFontSizes', params: { fontSizes: { standard: 24 } } },
  rules: ['P1', 'P27'],
}

/**
 * Routes whose font-24 scenario is defined but NOT registered yet, with the package that turns it on. The guard has no per-scenario
 * mode (a modes line matches the route, scenario part dropped), so a scenario that cannot pass yet is held here instead of making
 * its whole route warn. Empty since B9-09: /settings/shops/:id (held in w0b for its .pg__* tiles) draws them with SectionTitle and
 * Muted and passes P27 at 24 px text, so its scenario runs.
 */
export const FONT_24_DEFERRED = {}

const slug = (route) => (route === '/' ? 'today' : route.slice(1).replace(/:/g, '').replace(/\//g, '-'))
const scenarioOf = (route) => ({
  name: `${FONT_24.name}-${slug(route)}`,
  route,
  start: route,
  widths: FONT_24.widths,
  emulate: [FONT_24.cdp],
  rules: FONT_24.rules,
})

/** The registry scenarios, one per route that is not deferred. */
export const FONT_24_SCENARIOS = FONT_24.routes.filter((route) => !FONT_24_DEFERRED[route]).map(scenarioOf)
export const FONT_24_SCENARIO_NAMES = FONT_24_SCENARIOS.map((s) => s.name)
/** The deferred scenarios, defined in full (with their owner), so the package that turns one on only deletes its FONT_24_DEFERRED entry. */
export const FONT_24_DEFERRED_SCENARIOS = FONT_24.routes.filter((route) => FONT_24_DEFERRED[route]).map((route) => ({ ...scenarioOf(route), owner: FONT_24_DEFERRED[route] }))

export default { order: 200, scenarios: FONT_24_SCENARIOS, setups: {} }
