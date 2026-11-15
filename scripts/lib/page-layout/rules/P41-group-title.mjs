// P41 (by mode; B9-13, SSP-03): a grouped list without a visible ListGroup title. A page that shows several .list-group cards side by side
// (the Pantry's Storage Places, Shop's sections) names each in a visible heading; an aria-label alone names it for assistive technology only.
// Metrics (probes/group-title.mjs): untitledGroups: [{ sel, label }] for every visible ul.list-group__list that has an aria-label, no
// visible .list-group__title in its section, and a sibling .list-group or .list-group-section.
const f = (text) => ({ rule: 'P41', message: `P41 ${text}` })

export default {
  id: 'P41',
  title: 'A grouped list without a visible ListGroup title (SSP-03)',
  always: true, // B9-55: always fail at release (plan section 9)
  evaluate(m, _ctx) {
    const out = []
    for (const g of m.untitledGroups ?? []) out.push(f(`${g.sel} "${g.label}" is one of several lists but has no visible heading; pass a title to ListGroup (a group is never named only for assistive technology)`))
    return out
  },
}
