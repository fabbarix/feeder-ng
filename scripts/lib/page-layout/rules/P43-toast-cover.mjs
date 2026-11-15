// P43 (always fails; B9-18, SSP-12, SAFE R1): a toast covers the row being acted on (the [data-pricing] row while the Price keypad is
// open, the focused row), the bottom bar (the Scan button lives in it) or a sticky action bar. The metrics come from
// probes/toast-cover.mjs on the toast-pricing and toast-over-bar scenarios:
//   toastCover: { toasts: [{ sel, box }], targets: [{ kind: 'pricing' | 'focused-row' | 'bottom-bar' | 'sticky-bar', sel, box }] }
//   Box = { x, y, r, b } in px. A toast covers a target when the boxes overlap by more than 1 px in both directions (touching or
//   sharing an edge is clear). One finding per (toast, target) pair.
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-18.test.ts).
const f = (text) => ({ rule: 'P43', message: `P43 ${text}` })
/** Up to 1 px of overlap is rounding (a shared edge), not cover. */
const TOLERANCE = 1
const px = (n) => String(Math.round(n * 10) / 10)
const overlap = (a, b) => ({ w: Math.min(a.r, b.r) - Math.max(a.x, b.x), h: Math.min(a.b, b.b) - Math.max(a.y, b.y) })

const FIX = {
  pricing: 'hold toasts while the Price keypad is open (useToast().hold, SSP-12)',
  'focused-row': 'the toast region must sit clear of the row being acted on (SSP-12)',
  'bottom-bar': 'the toast region sits above --nav-top (and --keyboard-inset) (Toast.css)',
  'sticky-bar': 'the toast region is lifted by the sticky bar (--sticky-bar-clearance) (Toast.css)',
}

export default {
  id: 'P43',
  title: 'A toast covers the row being acted on ([data-pricing], the focused row), the bottom bar or a sticky bar (SSP-12)',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    const tc = m.toastCover
    if (!tc) return out
    for (const t of tc.toasts ?? []) {
      for (const g of tc.targets ?? []) {
        const o = overlap(t.box, g.box)
        if (o.w <= TOLERANCE || o.h <= TOLERANCE) continue
        out.push(f(`${t.sel} covers the ${g.kind} ${g.sel} by ${px(o.h)} px (height) x ${px(o.w)} px; ${FIX[g.kind] ?? 'move the toast clear of it'}`))
      }
    }
    return out
  },
}
