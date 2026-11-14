// P29 (always fails; B9-01, DS-12 R-A): An action in a tile, toast, sheet footer, dialog or banner whose boundary is under 3:1.
// Moved out of evaluateMetrics and darkBoundaryFindings in page-layout-rules.mjs by the w0b integration; the metrics come from
// ../probes/action-boundary.mjs, which also runs in the dark-scheme pass.
const f = (text) => ({ rule: 'P29', message: `P29 ${text}` })

const boundaryText = (b) =>
  `${b.sel} "${b.label}" in a ${b.surface}: its boundary is ${b.ratio}:1 against what it sits on (< 3); give it a fill and a 1 px outline (DS-12 R-A)`

export default {
  id: 'P29',
  title: 'An action in a tile, toast, sheet footer, dialog or banner whose boundary is under 3:1 (R-A)',
  always: true,
  // An action whose boundary (its outline or, without one, its fill) is under 3:1 against the surface it sits on. A link in
  // running text is not an action.
  evaluate(m, _ctx) {
    return (m.weakBoundaries ?? []).map((b) => f(boundaryText(b)))
  },
  // The same probe in the dark scheme.
  evaluateDark(dm, _ctx) {
    return (dm.weakBoundaries ?? []).map((b) => f(`${boundaryText(b)} (dark scheme)`))
  },
}
