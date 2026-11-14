// P16 (always fails): A chip whose label is crushed to its dot.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P16', message: `P16 ${text}` })

export default {
  id: 'P16',
  title: 'A chip whose label is crushed to its dot',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // hf-recipes-filter (docs/design/recipes-filter.md 11): a chip whose label is crushed to its dot (fails in every mode, see ALWAYS_FAIL).
    for (const c of m.crushedChips ?? []) out.push(f(`${c.sel} "${c.label}" is crushed to ${c.px} px: its label is cut by its ellipsis; give the chip its natural width (flex 0 1 auto, min-inline-size) and let the line take fewer chips or a "+N"`))
    return out
  },
}
