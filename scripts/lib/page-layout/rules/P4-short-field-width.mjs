// P4 (warn or fail by the route mode): From 820 px a short (numeric or xs/sm) field is at most 240 px wide.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P4', message: `P4 ${text}` })

export default {
  id: 'P4',
  title: 'From 820 px a short (numeric or xs/sm) field is at most 240 px wide',
  always: false,
  evaluate(m, { width }) {
    const out = []
    for (const fd of m.fields) {
      // A numeric-keypad field whose content is long by nature (a 14-digit code) says so with data-size-intent="long" (fd.long).
      if (width >= 820 && fd.short && !fd.segment && fd.size !== 'full' && fd.w > 240 && !fd.long) out.push(f(`short field "${fd.label}" is ${fd.w}px wide (max 240; set size="xs|sm")`))
    }
    return out
  },
}
