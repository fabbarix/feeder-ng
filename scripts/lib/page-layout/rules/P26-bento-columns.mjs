// P26 (always fails; B9-07, DS-09): a BentoGrid loses a column as the window widens. The metrics come from probes/bento-walk.mjs on the
// today-columns scenario: for every .bento-grid, the number of columns at each width of a 900..1320 px walk (step 20). A grid whose
// count falls from one width to the next is a finding (the beta.8 seam: 2 columns at 960-1020, 1 at 1040, when the 88 px rail
// took its width from the content at 1024). One finding per drop and per grid. Pure, so vitest tests it
// (web/src/app/pageLayoutRules.b9-07.test.ts).
const f = (text) => ({ rule: 'P26', message: `P26 ${text}` })

export default {
  id: 'P26',
  title: 'A BentoGrid loses a column as the window widens (resize walk) (DS-09)',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    for (const g of m.bentoWalk ?? []) {
      const s = g.samples ?? []
      for (let i = 1; i < s.length; i++) {
        if (!(s[i].cols < s[i - 1].cols)) continue
        // The band the grid is short in: from the first narrower sample to the next one (or one step on, at the walk's end).
        const step = s[i].w - s[i - 1].w
        const w1 = s[i + 1]?.w ?? s[i].w + step
        out.push(f(`${g.sel} drops from ${s[i - 1].cols} to ${s[i].cols} columns between ${s[i].w} and ${w1} px; size the tile minimum so the columns survive the rail (system.md 11)`))
      }
    }
    return out
  },
}
