// P8 (warn or fail by the route mode): From 768 px a modal dialog is at most 600 px wide and centred (640 px on a short viewport,
// SHORT-02).
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P8', message: `P8 ${text}` })

export default {
  id: 'P8',
  title: 'From 768 px a modal dialog is at most 600 px wide and centred',
  always: false,
  evaluate(m, { width }) {
    const out = []
    // SHORT-02 (short.md: "from 768 px wide the centred dialog widens to min(640px, 100vw - 48px)"): on a short viewport (under 500 px
    // high, a phone in landscape) the centred sheet may be up to that wide. A probe without vh (older metrics) keeps the 600 px limit.
    const short = typeof m.dialog?.vh === 'number' && m.dialog.vh < 500
    const max = short ? Math.min(640, m.dialog.vw - 48) : 600
    if (width >= 768 && m.dialog && (m.dialog.w > max || Math.abs(m.dialog.x + m.dialog.w / 2 - m.dialog.vw / 2) > 2)) {
      out.push(f(`dialog ${m.dialog.w}px wide at x=${m.dialog.x}`))
    }
    return out
  },
}
