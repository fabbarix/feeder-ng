// P39 (always fails; B9-07, A11Y-02 R-C and R-C+; was "P20" in the chapter): a focused control's ring is clipped, or touches a
// neighbouring control or a sticky bar, or two accent outlines show at once. The metrics come from probes/focus-rings.mjs on the
// focus-ring-room scenarios: each control is focused (focus-visible) in turn and its ring box measured.
//   focusRings: [{ sel, ring, clippers: [{ sel, box }], neighbours: [{ sel, box }], bars: [{ sel, box }], accentOutlines }]
//   ring = the border box of the element that draws the ring, grown by outline width + offset (0 for a ring drawn inside); a
//   clipper's box is its padding box; Box = { x, y, r, b } in px.
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-07.test.ts).
const f = (text) => ({ rule: 'P39', message: `P39 ${text}` })
/** Under half a pixel is rounding, not a clip. */
const TOLERANCE = 0.5
const px = (n) => String(Math.round(n * 10) / 10)
/** Closed boxes: sharing an edge counts as touching. */
const touches = (a, b) => a.x <= b.r && b.x <= a.r && a.y <= b.b && b.y <= a.b

export default {
  id: 'P39',
  title: "A focused control's ring box is clipped, or touches a neighbour or a sticky bar (A11Y-02)",
  always: true,
  evaluate(m, _ctx) {
    const out = []
    for (const e of m.focusRings ?? []) {
      const r = e.ring
      for (const c of e.clippers ?? []) {
        const sides = [
          ['top', c.box.y - r.y],
          ['bottom', r.b - c.box.b],
          ['start', c.box.x - r.x],
          ['end', r.r - c.box.r],
        ].filter(([, d]) => d > TOLERANCE)
        if (sides.length === 0) continue
        out.push(f(`${e.sel}: its ring is clipped by ${c.sel} at the ${sides.map(([s, d]) => `${s} by ${px(d)} px`).join(', ')}; give the container 5 px of room (padding and scroll-padding as --focus-ring-width + --focus-ring-offset) or draw the ring inside (A11Y-02)`))
        break
      }
      for (const n of e.neighbours ?? []) {
        if (touches(r, n.box)) out.push(f(`${e.sel}: its ring touches ${n.sel}; keep the controls a gap apart (8 px fine, 12 px coarse) or ring inside (A11Y-02)`))
      }
      for (const b of e.bars ?? []) {
        if (touches(r, b.box)) out.push(f(`${e.sel}: its ring touches the sticky bar ${b.sel}; set scroll-padding to the bar's height plus 5 px (A11Y-02)`))
      }
      if ((e.accentOutlines ?? 0) >= 2) out.push(f(`${e.sel}: ${e.accentOutlines} accent outlines are visible at once; a control nested in a frame or [data-focus-scope] rings inside itself and the frame steps back (R-C+)`))
    }
    return out
  },
}
