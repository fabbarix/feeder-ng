// P20 (always fails): Row 3 of the filter header sits one slot gap below row 2, and panel sections are 12 px apart.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P20', message: `P20 ${text}` })

export default {
  id: 'P20',
  title: 'Row 3 of the filter header sits one slot gap below row 2, and panel sections are 12 px apart',
  always: true,
  evaluate(m, _ctx) {
    const out = []
    const spacing = m.filterSpacing
    if (spacing) {
      if (spacing.rowGap !== null && spacing.rowGap < spacing.slotGap - 0.5) out.push(f(`row 3 sits ${spacing.rowGap} px below row 2; it must sit one slot gap (${spacing.slotGap} px) below it`))
      if (spacing.sectionGap !== null && spacing.sectionGap < 12) out.push(f(`two panel sections are ${spacing.sectionGap} px apart; space them at least 12 px`))
    }
    return out
  },
}
