// P5 (warn or fail by the route mode): A text, email, search or url field collapsed under 160 px.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P5', message: `P5 ${text}` })

export default {
  id: 'P5',
  title: 'A text, email, search or url field collapsed under 160 px',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    for (const fd of m.fields) {
      // A field that shares a wrapping row with chips (the tag input) says so with data-size-intent="inline" (fd.inline).
      if (['text', 'email', 'search', 'url'].includes(fd.type) && !fd.short && !fd.inline && fd.w < 160) out.push(f(`field "${fd.label}" collapsed to ${fd.w}px`))
    }
    return out
  },
}
