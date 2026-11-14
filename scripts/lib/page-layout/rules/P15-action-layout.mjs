// P15 (always fails): An action group collapsed, a button clipping its label, or text running under the actions.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P15', message: `P15 ${text}` })

export default {
  id: 'P15',
  title: 'An action group collapsed, a button clipping its label, or text running under the actions',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // DS-TODAY round 2 (system.md 5): an action group must not collapse, a button must hold its label, and no text may run under the
    // actions (fails in every mode, see ALWAYS_FAIL). A probe older than the field (undefined) is clean.
    for (const o of m.actionLayout ?? []) {
      const what = o.why === 'collapsed' ? 'collapsed to 0 px' : o.why === 'label-clipped' ? `clips its label by ${o.px} px` : `runs ${o.px} px under the actions`
      out.push(f(`${o.sel} ${what}; give the row a real actions track (max-content) and let the group take its own line on a phone`))
    }
    return out
  },
}
