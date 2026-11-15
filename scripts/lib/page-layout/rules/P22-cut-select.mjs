// P22 (always fails): a chip Select (a toolbar picker) cuts its value and is not icon-only (revised by B9-15, DS-03, decision DS 6).
// A chip Select shows its value in full or, when it cannot, is icon-only with its value in its accessible name. The metrics come from
// the cut-selects probe in ../probes/: [{ sel, label, shown, px, iconOnly?, name? }].
const f = (text) => ({ rule: 'P22', message: `P22 ${text}` })

export default {
  id: 'P22',
  title: 'A chip Select cuts its value and is not icon-only, or is icon-only without its value in its name',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    for (const c of m.cutSelects ?? []) {
      if (c.iconOnly) {
        // An icon-only chip hides its value on purpose; it passes only when its name carries the value ("Sort: Good until").
        if (typeof c.name === 'string' && c.label && c.name.includes(c.label)) continue
        out.push(f(`${c.sel} "${c.label}" is icon-only and its name ${c.name ? `"${c.name}"` : '(none)'} lacks its value; an icon-only chip Select carries its value in its name (system.md 6)`))
        continue
      }
      out.push(f(`${c.sel} "${c.label}" shows ${c.shown} px and cuts ${c.px} px of its value; a chip Select shows its value in full or, when it cannot, is icon-only with its value in its name (system.md 6)`))
    }
    return out
  },
}
