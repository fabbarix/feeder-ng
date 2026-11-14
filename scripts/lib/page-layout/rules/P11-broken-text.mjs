// P11 (warn or fail by the route mode): Text clipped by its box, or a word broken across lines.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P11', message: `P11 ${text}` })

export default {
  id: 'P11',
  title: 'Text clipped by its box, or a word broken across lines',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // QA-1: text clipped by its box ("clipped") or a word broken across lines ("mid-word").
    // An email or a link is one token that has to wrap somewhere, so a mid-word break inside one ("@", "://" or "/") is allowed.
    for (const b of m.brokenText ?? []) {
      if (b.why === 'mid-word' && /@|:\/\/|\//.test(b.token ?? '')) continue
      out.push(f(`${b.sel}: ${b.why}`))
    }
    return out
  },
}
