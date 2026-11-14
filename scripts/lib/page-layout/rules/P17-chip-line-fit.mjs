// P17 (always fails): A chip line shows a cut chip after its first, or a chip past its end.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P17', message: `P17 ${text}` })

export default {
  id: 'P17',
  title: 'A chip line shows a cut chip after its first, or a chip past its end',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // hf-recipes-filter round 2 (docs/design/recipes-filter.md 13.6): the chip line shows a cut chip after its first, or a chip past its end.
    for (const fl of m.fitLines ?? []) {
      const what = fl.why === 'cut' ? `is cut by its ellipsis (${fl.px} px of its label) after the first chip` : `runs ${fl.px} px past the end of its line`
      out.push(f(`${fl.sel} "${fl.label}" ${what}; a chip that does not fit goes into "+N", it is never shown cut or past the line`))
    }
    return out
  },
}
