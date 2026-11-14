// Probe "actions" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   actionLayout: [{ sel, why: 'collapsed' | 'label-clipped' | 'overlaps-actions', px }] (P15)
// DS-TODAY round 2 (P15, system.md 10): an action group that collapsed to 0 px, a button narrower than its label, or text that
// runs under the group. Measured in the page for every .action-group and .plan-course__actions; fails in every mode.
const actionProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const g of (main ? main.querySelectorAll('.action-group, .plan-course__actions') : [])) {
    if (!vis(g)) continue
    const gb = g.getBoundingClientRect()
    if (gb.width < 1) { out.push({ sel: sel(g), why: 'collapsed', px: 0 }); continue }
    for (const b of g.querySelectorAll('button')) {
      const over = b.scrollWidth - b.clientWidth
      // A labelled button only: an icon button's 44 px hit area is a pseudo-element that overhangs its 40 px box on purpose.
      if (vis(b) && over > 1 && b.textContent.trim() !== '') out.push({ sel: sel(b), why: 'label-clipped', px: Math.round(over) })
    }
    const row = g.parentElement
    for (const t of (row ? row.querySelectorAll('.to-confirm__text, .to-confirm__title, .to-confirm__meta, .plan-course__what') : [])) {
      if (!vis(t) || t.contains(g) || g.contains(t)) continue
      const tb = t.getBoundingClientRect()
      const w = Math.min(tb.right, gb.right) - Math.max(tb.left, gb.left)
      const h = Math.min(tb.bottom, gb.bottom) - Math.max(tb.top, gb.top)
      if (w > 1 && h > 1) out.push({ sel: sel(t), why: 'overlaps-actions', px: Math.round(w) })
    }
  }
  return out
})()`

export default { name: 'actions', key: 'actionLayout', order: 70, source: actionProbe }
