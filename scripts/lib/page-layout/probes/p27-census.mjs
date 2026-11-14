// Probe "p27-census" (in-page, B9-02; registered by the w0b integration). It fills
//   p27Census: { rootPx, h1, texts: [{ sel, px }], headings: [{ sel, level, px }] } (P27)
// only on the font-24 scenarios' pages (a 24 px browser text size). The page code is collectP27Metrics of rules/P27-font-24.mjs.
import { collectP27Metrics } from '../rules/P27-font-24.mjs'
import { FONT_24_SCENARIO_NAMES } from '../scenarios/font-24.mjs'

export default { name: 'p27-census', key: 'p27Census', order: 160, scenarios: FONT_24_SCENARIO_NAMES, source: `(${collectP27Metrics})()` }
