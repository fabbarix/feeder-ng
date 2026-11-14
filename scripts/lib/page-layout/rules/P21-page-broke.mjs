// P21 (always fails): The page broke (an exception, a console error or the error page) while walked through phone widths.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P21', message: `P21 ${text}` })

export default {
  id: 'P21',
  title: 'The page broke (an exception, a console error or the error page) while walked through phone widths',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // hf-recipes-filter round 3 (always fails): the page broke while it was walked through phone widths (RESIZE_WALK).
    for (const e of m.runtimeErrors ?? []) out.push(f(`the page broke (${e.why}): ${e.text}; the chip line must settle at every width, not loop (docs/design/recipes-filter.md 14)`))
    return out
  },
}
