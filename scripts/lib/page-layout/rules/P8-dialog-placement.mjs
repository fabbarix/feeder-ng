// P8 (warn or fail by the route mode): From 768 px a modal dialog is at most 600 px wide and centred.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P8', message: `P8 ${text}` })

export default {
  id: 'P8',
  title: 'From 768 px a modal dialog is at most 600 px wide and centred',
  always: false,
  evaluate(m, { width }) {
    const out = []
    if (width >= 768 && m.dialog && (m.dialog.w > 600 || Math.abs(m.dialog.x + m.dialog.w / 2 - m.dialog.vw / 2) > 2)) {
      out.push(f(`dialog ${m.dialog.w}px wide at x=${m.dialog.x}`))
    }
    return out
  },
}
