// P28 (by mode; B9-13, DS-10): a navigation row's two-line description is cut at its second line at the default text spacing.
// Metrics (probes/nav-meta.mjs): cutNavMeta: [{ sel, label, lines, cutPx }] for every visible
// .list-row[data-meta-lines='2'] .list-row__meta-text whose text needs more than its two clamped lines (cutPx > 0.5).
const f = (text) => ({ rule: 'P28', message: `P28 ${text}` })

export default {
  id: 'P28',
  title: 'A two-line navigation description is cut (DS-10)',
  always: true, // B9-55: always fail at release (plan section 9)
  evaluate(m, _ctx) {
    const out = []
    for (const c of m.cutNavMeta ?? []) out.push(f(`${c.sel} "${c.label}" is cut at its second line; shorten the description (system.md 3)`))
    return out
  },
}
