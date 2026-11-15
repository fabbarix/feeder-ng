// P12 (warn or fail by the route mode): At the end of a scroll no content box of main is under the floating bottom bar.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P12', message: `P12 ${text}` })

export default {
  id: 'P12',
  title: 'At the end of a scroll no content box of main is under the floating bottom bar',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // DS-A (system.md 8): at the end of a scroll, no content box of <main> is under the floating bottom bar (null: no bar, from 1024 px).
    for (const o of m.navOverlap ?? []) out.push(f(`${o.sel} is under the bottom bar by ${o.px} px at the end of the scroll; add clearance (--nav-clearance)`))
    // B9-37 (RX-09): the Tag chooser's options are not under a sticky bar. metrics.optionCover = { options: [{ sel, box, top }], bars: [{ sel, box }] }
    // from probes/option-cover.mjs (the recipe-editor-tag-chooser scenario only). An option is covered when a bar's box overlaps it by more
    // than 1 px each way AND something other than the option paints at its centre (`top` false); a chooser that is a modal sheet in the
    // top layer paints over the bar, so a bar behind it is not cover.
    const oc = m.optionCover
    if (oc) {
      for (const o of oc.options ?? []) {
        if (o.top !== false) continue
        for (const b of oc.bars ?? []) {
          const w = Math.min(o.box.r, b.box.r) - Math.max(o.box.x, b.box.x)
          const h = Math.min(o.box.b, b.box.b) - Math.max(o.box.y, b.box.y)
          if (w > 1 && h > 1) out.push(f(`Tag chooser option ${o.sel} is under ${b.sel} by ${Math.round(h)} px; open the chooser clear of the sticky bar (sheet in the top layer, or a popover that stops at the bar's top)`))
        }
      }
    }
    return out
  },
}
