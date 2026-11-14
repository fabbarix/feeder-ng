// P23 (always fails): The one-line hint of a Shop row (Meal Slot hint or Restock reason) cut by its ellipsis.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P23', message: `P23 ${text}` })

export default {
  id: 'P23',
  title: 'The one-line hint of a Shop row (Meal Slot hint or Restock reason) cut by its ellipsis',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // b8-shop (always fails): a Shop row's one-line info meta is cut by its ellipsis: a food Line's Meal Slot hint ("Tue Dinner +1")
    // or, since b8-polish, a Supply Line's Restock reason ("400/1000 ml" below 420 px).
    for (const c of m.cutMeta ?? []) out.push(f(`${c.sel} "${c.label}" shows ${c.shown} px and cuts ${c.px} px of its hint with an ellipsis; the Shop's hint names the first Meal Slot and counts the rest, and a Restock reason is compact ("400/1000 ml") below 420 px, so each fits its row: give the row room (--row-value-min) or shorten the hint`))
    return out
  },
}
