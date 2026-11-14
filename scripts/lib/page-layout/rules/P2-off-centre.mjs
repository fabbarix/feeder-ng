// P2 (warn or fail by the route mode): From 1024 px the content is centred in the area beside the rail (within 24 px).
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P2', message: `P2 ${text}` })

export default {
  id: 'P2',
  title: 'From 1024 px the content is centred in the area beside the rail (within 24 px)',
  always: false,
  evaluate(m, { width, kind }) {
    const out = []
    if (width >= 1024 && kind !== 'full' && m.content.r > m.content.x) {
      const offset = Math.round((m.content.x + m.content.r) / 2 - (m.railR + m.vw) / 2)
      if (Math.abs(offset) > 24) out.push(f(`content is off-centre by ${offset}px (content ${m.content.x}-${m.content.r}, area ${m.railR}-${m.vw})`))
    }
    return out
  },
}
