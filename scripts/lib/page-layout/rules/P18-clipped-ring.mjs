// P18 (always fails): A focus ring, or the hit area of a removable chip, cut by a clipping ancestor.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P18', message: `P18 ${text}` })

export default {
  id: 'P18',
  title: 'A focus ring, or the hit area of a removable chip, cut by a clipping ancestor',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    // A focus ring (3 px outline, 2 px offset) or a removable chip's 44 px hit area cut by a clipping ancestor.
    for (const c of m.clippedRings ?? []) out.push(f(`${c.sel} "${c.label}": its ${c.what} is cut by a clipping ancestor by ${c.px} px; do not clip the line, or pad it by the ring (5 px) and the hit area (9 px)`))
    return out
  },
}
