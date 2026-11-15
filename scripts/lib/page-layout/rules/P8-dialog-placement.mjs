// P8 (warn or fail by the route mode): From 768 px a modal dialog is at most 600 px wide (640 px under 500 px tall, SHORT-02) and centred.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P8', message: `P8 ${text}` })

export default {
  id: 'P8',
  title: 'From 768 px a modal dialog is at most 600 px wide and centred',
  always: false,
  evaluate(m, { width }) {
    const out = []
    // w2c: on a short viewport (under 500 px tall) the sheet is SHORT-02's centred dialog, 640 px wide (SHORT-07's two-column Filters).
    const max = m.dialog && m.dialog.vh !== undefined && m.dialog.vh < 500 ? 640 : 600
    if (width >= 768 && m.dialog && (m.dialog.w > max || Math.abs(m.dialog.x + m.dialog.w / 2 - m.dialog.vw / 2) > 2)) {
      out.push(f(`dialog ${m.dialog.w}px wide at x=${m.dialog.x}`))
    }
    return out
  },
}
