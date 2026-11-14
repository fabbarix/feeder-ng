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

const slug = (route) => (route === '/' ? 'today' : route.slice(1).replace(/:/g, '').replace(/\//g, '-'))

/** The registry scenarios, one per route. */
export const FONT_24_SCENARIOS = FONT_24.routes.map((route) => ({
  name: `${FONT_24.name}-${slug(route)}`,
  route,
  start: route,
  widths: FONT_24.widths,
  emulate: [FONT_24.cdp],
  rules: FONT_24.rules,
}))
export const FONT_24_SCENARIO_NAMES = FONT_24_SCENARIOS.map((s) => s.name)

export default { order: 200, scenarios: FONT_24_SCENARIOS, setups: {} }
