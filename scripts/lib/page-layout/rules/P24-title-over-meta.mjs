// P24 (always fails; B9-13, DS-05): a ListRow's title paints over its meta. The title is clamped to two lines by overflow: hidden;
// a screen that sets overflow: visible keeps the clamp's box but paints every line over the meta (the Leftovers tile at 320).
// Metrics (probes/row-overlap.mjs): rowOverlap: [{ sel, label, titleBottom, metaTop }]; titleBottom is the title's painted bottom
// (top + scrollHeight when its overflow is visible, else its clientHeight), metaTop the meta's top, both in page px.
const f = (text) => ({ rule: 'P24', message: `P24 ${text}` })

export default {
  id: 'P24',
  title: "A row's title paints over its meta (DS-05)",
  always: true,
  evaluate(m, _ctx) {
    const out = []
    for (const r of m.rowOverlap ?? []) {
      const over = r.titleBottom - r.metaTop
      if (over > 1) out.push(f(`${r.sel} "${r.label}" paints its title ${Math.round(over)} px over its meta; a row clamps its title at 2 lines with an ellipsis and never overrides it, a row that needs more uses wrapTitle or metaLines={2} (system.md 3)`))
    }
    return out
  },
}
