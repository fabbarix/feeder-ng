// P35 (always fails; B9-19, SHORT-05; was "P20" in the chapter): no content box of <main> starts at an x lower than the left safe-area
// inset or ends past innerWidth minus the right inset. The metrics come from probes/safe-gutters.mjs on the safe-gutters scenarios
// (the 844x390-inset viewport: insets 47 left and right):
//   safeGutters: { innerWidth, left, right, boxes: [{ sel, x, r }] }
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-19.test.ts).
const f = (text) => ({ rule: 'P35', message: `P35 ${text}` })
const TOLERANCE = 0.5
const px = (n) => String(Math.round(n * 10) / 10)

export default {
  id: 'P35',
  title: 'Content inside a safe-area inset (SHORT-05; the inset scenario)',
  always: true,
  evaluate(m, _ctx) {
    const g = m.safeGutters
    if (!g) return []
    const out = []
    const seen = new Set()
    for (const b of g.boxes ?? []) {
      if (b.x < g.left - TOLERANCE) {
        const key = `${b.sel}:l`
        if (!seen.has(key)) out.push(f(`${b.sel} starts at x ${px(b.x)}, ${px(g.left - b.x)} px inside the left inset (${px(g.left)} px); every gutter is max(gutter, inset) on its side (system.md 11.5)`))
        seen.add(key)
      }
      if (b.r > g.innerWidth - g.right + TOLERANCE) {
        const key = `${b.sel}:r`
        if (!seen.has(key)) out.push(f(`${b.sel} ends at x ${px(b.r)}, ${px(b.r - (g.innerWidth - g.right))} px inside the right inset (${px(g.right)} px); every gutter is max(gutter, inset) on its side (system.md 11.5)`))
        seen.add(key)
      }
    }
    return out
  },
}
