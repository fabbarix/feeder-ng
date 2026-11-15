// P32 (by the route mode until B9-55; B9-19, SHORT-04; was "P17" in the chapter): at load, fixed and sticky chrome covers at most 35 % of
// the viewport height. The metrics come from probes/chrome-budget.mjs on the chrome scenarios (667x375 and 375x256):
//   chromeBudget: { innerHeight, boxes: [{ sel, y, b }] }   horizontal bars, clipped to the viewport, px from the top
// The covered height is the union of the boxes' vertical extents (two bars that overlap count once).
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-19.test.ts).
const f = (text) => ({ rule: 'P32', message: `P32 ${text}` })
const LIMIT = 0.35

/** Total length of the union of [y, b] intervals. */
const union = (boxes) => {
  const sorted = [...boxes].sort((a, b) => a.y - b.y)
  let total = 0
  let end = -Infinity
  for (const { y, b } of sorted) {
    const from = Math.max(y, end)
    if (b > from) total += b - from
    end = Math.max(end, b)
  }
  return total
}

export default {
  id: 'P32',
  title: 'Fixed and sticky chrome covers more than 35 % of the viewport height at load (SHORT)',
  always: false,
  evaluate(m, _ctx) {
    const c = m.chromeBudget
    if (!c || !(c.innerHeight > 0)) return []
    const covered = union(c.boxes ?? [])
    if (covered <= LIMIT * c.innerHeight) return []
    const pct = Math.round((covered / c.innerHeight) * 100)
    const sels = [...new Set((c.boxes ?? []).map((b) => b.sel))].join(', ')
    return [f(`fixed and sticky chrome covers ${pct} % of the viewport height at load (${Math.round(covered)} of ${c.innerHeight} px: ${sels}); the limit is 35 % (system.md 11)`)]
  },
}
