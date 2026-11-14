// P22 (always fails): A chip Select (a toolbar picker) cuts its value with an ellipsis.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P22', message: `P22 ${text}` })

export default {
  id: 'P22',
  title: 'A chip Select (a toolbar picker) cuts its value with an ellipsis',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // pantry-filter review (always fails): a chip Select (a toolbar picker: Sort, Shop) cuts its value with an ellipsis. Such a chip
    // is sized by its value, so a cut value means its row has no room for it ("G…", then "Good u…", passed every other rule: P16 reads
    // only .chip labels).
    for (const c of m.cutSelects ?? []) out.push(f(`${c.sel} "${c.label}" shows ${c.shown} px and cuts ${c.px} px of its value with an ellipsis; a chip Select shows its value in full: give its row room or take it from what sits beside it`))
    return out
  },
}
