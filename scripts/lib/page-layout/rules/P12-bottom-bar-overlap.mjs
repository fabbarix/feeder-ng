// P12 (warn or fail by the route mode): At the end of a scroll no content box of main is under the floating bottom bar.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P12', message: `P12 ${text}` })

export default {
  id: 'P12',
  title: 'At the end of a scroll no content box of main is under the floating bottom bar',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // DS-A (system.md 8): at the end of a scroll, no content box of <main> is under the floating bottom bar (null: no bar, from 1024 px).
    for (const o of m.navOverlap ?? []) out.push(f(`${o.sel} is under the bottom bar by ${o.px} px at the end of the scroll; add clearance (--nav-clearance)`))
    return out
  },
}
