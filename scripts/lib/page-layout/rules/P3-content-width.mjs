// P3 (warn or fail by the route mode): From 1024 px the content is no wider than its page kind allows (PAGE_WIDTH_PX + 40).
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
import { PAGE_WIDTH_PX } from '../constants.mjs'
const f = (text) => ({ rule: 'P3', message: `P3 ${text}` })

export default {
  id: 'P3',
  title: 'From 1024 px the content is no wider than its page kind allows (PAGE_WIDTH_PX + 40)',
  always: false,
  evaluate(m, { width, kind }) {
    const out = []
    if (width >= 1024 && kind !== 'full' && m.content.r > m.content.x) {
      const w = m.content.r - m.content.x
      const max = PAGE_WIDTH_PX[kind]
      if (max !== undefined && w > max + 40) out.push(f(`content is ${w}px wide; a ${kind} page is at most ${max}px`))
    }
    return out
  },
}
