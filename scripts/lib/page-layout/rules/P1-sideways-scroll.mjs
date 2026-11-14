// P1 (always fails): Horizontal overflow: the page scrolls sideways, or an element runs past the right edge.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P1', message: `P1 ${text}` })

export default {
  id: 'P1',
  title: 'Horizontal overflow: the page scrolls sideways, or an element runs past the right edge',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    if (m.scrollW > m.clientW) out.push(f(`sideways scroll (scrollWidth ${m.scrollW} > ${m.clientW})`))
    if (m.over.length) out.push(f(`elements past the right edge: ${m.over.join(', ')}`))
    return out
  },
}
