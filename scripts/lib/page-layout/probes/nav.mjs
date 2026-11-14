// Probe "nav" (in-page, B9-03). It fills the metrics field
//   navOverlap: [{ sel, px }] of the content under the bottom bar at the end of the scroll, or null without a bar (P12)
// P12 (DS-A round 2, system.md 8): the probe is scripts/lib/page-layout-nav-probe.js (feederNavProbe), shared with the static
// fixtures of scripts/test/ds-layout_test.sh. It stays that one file; this module evaluates it in the page.
import { readFileSync } from 'node:fs'

const navProbeSource = readFileSync(new URL('../../page-layout-nav-probe.js', import.meta.url), 'utf8')

export default { name: 'nav', key: 'navOverlap', order: 20, source: `(() => { ${navProbeSource}\n; return feederNavProbe() })()` }
