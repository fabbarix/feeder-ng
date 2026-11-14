// P30 (always fails; B9-01): A Segmented option on two lines (and [data-one-line] buttons).
// Moved out of evaluateMetrics in page-layout-rules.mjs by the w0b integration; the metrics come from ../probes/one-line.mjs.
const f = (text) => ({ rule: 'P30', message: `P30 ${text}` })

export default {
  id: 'P30',
  title: 'A Segmented option on two lines (and [data-one-line] buttons)',
  always: true,
  evaluate(m, _ctx) {
    return (m.wrappedOptions ?? []).map((o) => f(`${o.sel} "${o.label}" runs onto ${o.lines} lines; a Segmented option is one line: the control spans its container, then the screen shortens the labels`))
  },
}
