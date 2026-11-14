// P13 (always fails): A box wider than its tile or card spills past it.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P13', message: `P13 ${text}` })

export default {
  id: 'P13',
  title: 'A box wider than its tile or card spills past it',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // DS-A round 2 (system.md 10): a box wider than its tile or card spills past it (fails in every mode, see ALWAYS_FAIL).
    for (const o of m.tileOverflow ?? []) out.push(f(`${o.sel} spills ${o.px} px past its ${o.card}; give its track min-inline-size: 0 or let it wrap or scroll`))
    return out
  },
}
