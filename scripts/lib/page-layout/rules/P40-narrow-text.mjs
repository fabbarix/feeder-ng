// P40 (by mode; B9-13; was "P29"/"P31" in the settings chapters, SET-03 and SET-12): a .list-row__title or a field error narrower than
// 120 px. A title that narrow breaks mid-word or shows two letters ("admin@ / examp…"): the row needs room, or its actions their own line.
// Metrics (probes/narrow-text.mjs): narrowText: [{ sel, label, width }]; width is the painted box's width in px.
const MIN = 120
const f = (text) => ({ rule: 'P40', message: `P40 ${text}` })

export default {
  id: 'P40',
  title: 'A .list-row__title or a field error narrower than 120 px (SET)',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    for (const n of m.narrowText ?? []) {
      if (n.width < MIN) out.push(f(`${n.sel} "${n.label}" is ${Math.round(n.width)} px wide, under ${MIN} px; give the text its own line (the row's actions slot) or more room`))
    }
    return out
  },
}
