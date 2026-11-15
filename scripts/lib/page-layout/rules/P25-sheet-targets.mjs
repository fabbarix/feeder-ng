// P25 (always fails; B9-14, DS-01 and DS-02): a target under 44 px in an open sheet, two overlapping targets, or touching bottom-bar
// labels. Metrics from probes/sheet-targets.mjs, key sheetMetrics (only on the opted-in scenarios; absent elsewhere, so nothing is reported):
//   sheetMetrics: { sheetTargets: [{ sel, w, h, hitW, hitH }], sheetOverlaps: [{ a, b }], barLabels: [{ text, box: { x, y, r, b } }] }
// A target counts by its hit area: the larger of its box and the ::after that extends it (a 40 px Close has a 52 px hit area).
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-14.test.ts).
const f = (text) => ({ rule: 'P25', message: `P25 ${text}` })
export const MIN_TARGET = 44
/** Under half a pixel is rounding. */
const TOLERANCE = 0.5

export default {
  id: 'P25',
  title: 'A target under 44 px in an open sheet, two overlapping targets, or touching bottom-bar labels (DS-01, DS-02)',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    const s = m.sheetMetrics
    if (!s) return out
    for (const t of s.sheetTargets ?? []) {
      if (t.hitW < MIN_TARGET - TOLERANCE || t.hitH < MIN_TARGET - TOLERANCE) {
        out.push(f(`${t.sel}: a target of ${Math.round(t.hitW)}x${Math.round(t.hitH)} px in an open sheet; every target is at least 44x44 (the whole row is the target in a Menu sheet)`))
      }
    }
    for (const o of s.sheetOverlaps ?? []) out.push(f(`${o.a} and ${o.b}: two targets overlap in an open sheet; keep them apart`))
    const labels = s.barLabels ?? []
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].box, b = labels[j].box
        const sameLine = Math.min(a.b, b.b) - Math.max(a.y, b.y) > 0
        const gap = Math.max(b.x - a.r, a.x - b.r)
        if (sameLine && gap < 1) out.push(f(`bottom-bar labels "${labels[i].text}" and "${labels[j].text}" touch (${Math.round(gap * 10) / 10} px apart); icons only at 375 px and below, or room for each label (DS-02)`))
      }
    }
    return out
  },
}
