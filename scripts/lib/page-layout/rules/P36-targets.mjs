// P36 (by mode; B9-16, A11Y-09; was "P17" in the chapter): on a touch profile a control's hit area is under 44 px, or two controls'
// hit areas overlap. The metrics come from probes/targets.mjs on the touch-targets scenarios (a touch emulation, so `(pointer: coarse)`
// holds and the coarse ::after blocks apply):
//   targets: { coarse: boolean, items: [{ i, sel, w, h, hit: { x, y, r, b }, anc: [i...], inline: boolean }] } | null
//   hit = the control's border box united with its ::after box (the hit area A11Y-09 draws with a negative inset); anc = the indexes of
//   the controls that contain it (a button inside a role=button row); inline = a link inside running text (WCAG 2.5.8 exempts it).
// Not touch (coarse false), or no metrics: no findings. Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-16.test.ts).
const f = (text) => ({ rule: 'P36', message: `P36 ${text}` })
export const TARGET_MIN = 44
/** Half a pixel is rounding; neighbours that abut (the Segmented options) overlap by 0, and a pixel of overlap is not a mistake. */
const ROUND = 0.5
const OVERLAP = 1
const px = (n) => String(Math.round(n * 10) / 10)

export default {
  id: 'P36',
  title: 'A target under 44 px on touch profiles, or two overlapping targets (A11Y-09)',
  always: false,
  evaluate(m, _ctx) {
    const t = m.targets
    if (!t || !t.coarse || !Array.isArray(t.items)) return []
    const out = []
    for (const e of t.items) {
      if (e.inline) continue
      const w = e.hit.r - e.hit.x
      const h = e.hit.b - e.hit.y
      if (w < TARGET_MIN - ROUND || h < TARGET_MIN - ROUND) {
        out.push(f(`${e.sel}: its hit area is ${px(w)} x ${px(h)} px; a touch target is at least ${TARGET_MIN} x ${TARGET_MIN} px, drawn with the control's own ::after (negative inset) inside @media (pointer: coarse), never by growing the visual (A11Y-09)`))
      }
    }
    const items = t.items.filter((e) => !e.inline)
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const x = items[a]
        const y = items[b]
        if ((x.anc ?? []).includes(y.i) || (y.anc ?? []).includes(x.i)) continue
        const ow = Math.min(x.hit.r, y.hit.r) - Math.max(x.hit.x, y.hit.x)
        const oh = Math.min(x.hit.b, y.hit.b) - Math.max(x.hit.y, y.hit.y)
        if (ow > OVERLAP && oh > OVERLAP) {
          out.push(f(`${x.sel} and ${y.sel}: their hit areas overlap by ${px(ow)} x ${px(oh)} px, so a tap in the overlap can hit the wrong one; put the icon buttons of a row in an IconSet (gap --icon-set-gap, 12 px on a coarse pointer) (A11Y-09)`))
        }
      }
    }
    return out
  },
}
