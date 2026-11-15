// P33 (always fails; B9-14, SHORT-02; was "P18" in the chapter): a sheet body under min(96 px, 30 % of innerHeight), or a footer
// visible while the sheet's first required control is clipped. Metrics from probes/sheet-body.mjs, key sheetBody (null / absent: no
// modal sheet open, nothing reported):
//   sheetBody: { sel, bodyH, panelH, innerHeight, flow, firstControl: { sel, clipped } | null, footerVisible }
// A sheet in flow mode (data-footer="flow": the panel scrolls, the body is not a scroller) keeps the floor too: its body is as tall as
// its content and at least min-block-size. Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-14.test.ts).
const f = (text) => ({ rule: 'P33', message: `P33 ${text}` })
/** The body floor of rule P33 and of the CSS `min-block-size: min(6rem, 30dvh)`. */
export const bodyFloor = (innerHeight) => Math.min(96, 0.3 * innerHeight)
const TOLERANCE = 0.5

export default {
  id: 'P33',
  title: 'A sheet body under min(96px, 30 % of innerHeight), or a footer visible while the first required control is clipped (SHORT-02)',
  always: true,
  evaluate(m, _ctx) {
    const b = m.sheetBody
    if (!b) return []
    const out = []
    const floor = bodyFloor(b.innerHeight)
    if (b.bodyH < floor - TOLERANCE) {
      out.push(f(`${b.sel}: the sheet body is ${Math.round(b.bodyH)} px of a ${Math.round(b.panelH)} px panel at ${b.innerHeight} px tall, under the ${Math.round(floor)} px floor; give the body min-block-size min(6rem, 30dvh) and let the footer flow (SHORT-02)`))
    }
    if (b.footerVisible && b.firstControl?.clipped) {
      out.push(f(`${b.sel}: the footer is visible while ${b.firstControl.sel}, the first control, is cut off; the question must not hide behind its answer (SHORT-02)`))
    }
    return out
  },
}
