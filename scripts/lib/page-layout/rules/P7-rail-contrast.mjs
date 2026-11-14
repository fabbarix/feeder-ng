// P7 (warn or fail by the route mode): The current side-rail item reaches 4.5:1 contrast.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P7', message: `P7 ${text}` })

export default {
  id: 'P7',
  title: 'The current side-rail item reaches 4.5:1 contrast',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    if (m.railContrast !== null && m.railContrast < 4.5) out.push(f(`current rail item contrast ${m.railContrast}:1 (< 4.5)`))
    return out
  },
}
