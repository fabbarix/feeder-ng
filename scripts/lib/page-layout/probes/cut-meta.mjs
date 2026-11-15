// Probe "cut-meta" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   cutMeta: [{ sel, label, shown, px }] (P23)
// b8-shop (P23): the Shop hint (a food Line's Meal Slot hint, "Fri Dinner +2") cut by its ellipsis, at every width. The text is measured
// with a Range per painted text node (like cutSelectProbe), so the ellipsis is found whatever it paints. b8-polish: the Supplies group's Restock reason is read
// too; below 420 px it is the compact "400 ml/1 l", which the probe measures as painted.
const cutMetaProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  // B9-34 (SSP-01): every Shop meta line is read, not only the info ones: a ticked row's "+500 g in Stock" (success), "Not added to Stock"
  // and "Scanned · 700 g" (muted), "Added twice · Sam 50 g, you 50 g" are cut like any hint (P23 on ticked rows).
  for (const long of (main ? main.querySelectorAll('.shop-lines .list-row__meta .list-row__meta-text') : [])) {
    // B9-13 (SSP-05): a row with a compact form shows it while its text column is under 12 rem; the long text is then visually
    // hidden (a 1 px clip), so the painted form is the one measured.
    const compact = long.nextElementSibling && long.nextElementSibling.matches('.list-row__meta-compact') ? long.nextElementSibling : null
    const t = compact && getComputedStyle(compact).display !== 'none' ? compact : long
    if (t.getClientRects().length === 0) continue
    const box = t.getBoundingClientRect()
    // the painted text only: a compact Restock reason carries its full text in a .visually-hidden span (b8-polish), whose text
    // still lays out at full width inside its 1 px clip, so its text nodes are left out of the measure and the label.
    const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT)
    let left = Infinity, right = -Infinity, label = ''
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement && n.parentElement.closest('.visually-hidden')) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      const r = range.getBoundingClientRect()
      if (r.width > 0) { left = Math.min(left, r.left); right = Math.max(right, r.right) }
      label += n.textContent
    }
    label = label.trim()
    const cut = Math.max(t.scrollWidth - t.clientWidth, right > left ? right - left - box.width : 0)
    if (cut > 0.5) out.push({ sel: t === long ? 'span.list-row__meta-text' : 'span.list-row__meta-compact', label, shown: Math.round(box.width), px: Math.round(cut) })
  }
  return out
})()`

export default { name: 'cut-meta', key: 'cutMeta', order: 60, source: cutMetaProbe }
