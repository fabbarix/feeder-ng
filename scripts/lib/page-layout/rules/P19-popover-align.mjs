// P19 (always fails): From 768 px an open popover ends where its trigger ends, inside the page content box.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P19', message: `P19 ${text}` })

export default {
  id: 'P19',
  title: 'From 768 px an open popover ends where its trigger ends, inside the page content box',
  always: true,
  evaluate(m, { width }) {
    const out = []
    const align = m.popoverAlign
    if (width >= 768 && align) {
      if (Math.abs(align.dx) > 1) out.push(f(`the open popover's end edge is ${Math.abs(Math.round(align.dx))} px ${align.dx < 0 ? 'inside' : 'past'} its trigger's end edge; end-align it with the trigger`))
      if (align.right > align.contentR + 1 || align.left < align.contentX - 1) {
        out.push(f(`the open popover leaves the page content box (x ${Math.round(align.left)} to ${Math.round(align.right)}, content ${Math.round(align.contentX)} to ${Math.round(align.contentR)}); keep it inside the page`))
      }
    }
    return out
  },
}
