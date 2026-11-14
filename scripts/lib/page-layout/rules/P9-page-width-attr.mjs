// P9 (warn or fail by the route mode): The data-page-width of the page container matches the route table.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P9', message: `P9 ${text}` })

export default {
  id: 'P9',
  title: 'The data-page-width of the page container matches the route table',
  always: false,
  evaluate(m, { kind }) {
    const out = []
    if (kind !== 'full' && m.pageWidthAttr !== kind) out.push(f(`the page container says data-page-width="${m.pageWidthAttr}", the route table says "${kind}"`))
    return out
  },
}
