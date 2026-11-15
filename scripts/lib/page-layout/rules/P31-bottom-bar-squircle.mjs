// P31 (always fails; B9-19, DS-02 / R-F): the bottom bar's current-page highlight and the Scan button are 40 px squircles inside the bar:
// the `.bottom-bar__icon` span of the current link and of Scan is square (within 0.5 px) and lies at least 6 px inside the bar's box.
// The metrics come from probes/bottom-bar-squircles.mjs on the `bottom-bar` scenario (375, 390 and 430 px):
//   barSquircles: null | { bar: Box, links: [{ label, current, accent, icon: Box | null }] }   Box = { x, y, r, b, w, h }
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-19.test.ts).
const f = (text) => ({ rule: 'P31', message: `P31 ${text}` })
const SQUARE_TOLERANCE = 0.5
const MIN_INSIDE = 6
const px = (n) => String(Math.round(n * 10) / 10)

export default {
  id: 'P31',
  title: 'A bottom-bar squircle that is not square, or not 6 px inside the bar (R-F)',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    const s = m.barSquircles
    if (!s) return out
    for (const l of s.links ?? []) {
      if (!l.current && !l.accent) continue
      const sel = `.bottom-bar__link "${l.label}" .bottom-bar__icon`
      if (!l.icon) {
        out.push(f(`${sel.replace(' .bottom-bar__icon', '')} has no .bottom-bar__icon span; the bar's highlight and Scan are 40 px squircles inside the bar (system.md 8)`))
        continue
      }
      const { w, h } = l.icon
      const dx = Math.min(l.icon.x - s.bar.x, s.bar.r - l.icon.r)
      const dy = Math.min(l.icon.y - s.bar.y, s.bar.b - l.icon.b)
      if (Math.abs(w - h) > SQUARE_TOLERANCE || dx < MIN_INSIDE || dy < MIN_INSIDE) {
        out.push(f(`${sel} is ${px(w)}x${px(h)} px at ${px(dx)}/${px(dy)} px inside the bar; the bar's highlight and Scan are 40 px squircles inside the bar (system.md 8)`))
      }
    }
    return out
  },
}
