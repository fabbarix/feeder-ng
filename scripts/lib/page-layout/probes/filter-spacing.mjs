// Probe "filter-spacing" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   filterSpacing: { rowGap, slotGap, sectionGap }, or null (P20)
// P20: row 3 (the chip line) sits one slot gap below row 2 (the gap of the header's own stack, .filter-bar, or the ListPage's), and the
// panel's sections are spaced.
const filterSpacingProbe = `
(() => {
  const row2 = document.querySelector('.filter-bar__view-row'), row3 = document.querySelector('.filter-chips')
  const stack = row3 ? row3.closest('.filter-bar, .list-page') : null
  const slotGap = stack ? parseFloat(getComputedStyle(stack).rowGap) : NaN
  let rowGap = null
  if (row2 && row3 && row3.getBoundingClientRect().height > 0) rowGap = Math.round((row3.getBoundingClientRect().top - row2.getBoundingClientRect().bottom) * 10) / 10
  const sections = [...document.querySelectorAll('.filter-panel__section')]
  // w2c: the gap between two sections stacked in one column (SHORT-07 sets the Filters body in two columns on a short landscape
  // viewport; sections side by side have no vertical gap to measure). The smallest such gap; null when no two are stacked.
  const boxes = sections.map((s) => s.getBoundingClientRect())
  const gaps = []
  for (let i = 0; i < boxes.length; i++) for (let j = 0; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]
    if (i !== j && b.top >= a.bottom - 0.5 && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) gaps.push(b.top - a.bottom)
  }
  const sectionGap = gaps.length ? Math.round(Math.min(...gaps) * 10) / 10 : null
  if (rowGap === null && sectionGap === null) return null
  return { rowGap, slotGap, sectionGap }
})()`

export default { name: 'filter-spacing', key: 'filterSpacing', order: 120, source: filterSpacingProbe }
