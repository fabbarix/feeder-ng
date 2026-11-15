// Probe "cut-meta" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   cutMeta: [{ sel, label, shown, px }] (P23)
// b8-shop (P23): the Shop hint (a food Line's Meal Slot hint, "Fri Dinner +2") cut by its ellipsis, at every width. The text is measured
// with a Range per painted text node (like cutSelectProbe), so the ellipsis is found whatever it paints. b8-polish: the Supplies group's Restock reason is read
// too; below 420 px it is the compact "400 ml/1 l", which the probe measures as painted. B9-29 (SSP-05): every visible row meta is
// read (the Pantry's status, the Supplies' Restock reason, any list): a meta is never cut, whatever screen it is on.
// w3c integration: P23 always fails, so the routes whose owners have not cleaned their metas yet keep the old reach (the Shop's info
// hints only) until that package lands and deletes its entry here: /settings and /settings/planning (B9-51), /scan (B9-41).
// int1: B9-34 has landed and /shop is clean at every width (1180 included), so /shop gets the full reach.
// w5a: B9-41 has landed (To get rows with a pack take their compact meta), so /scan gets the full reach.
const PENDING_ROUTES = ['/settings', '/settings/planning']
const cutMetaProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  // B9-34 (SSP-01) and B9-29: every visible row meta line is read, not only the Shop's info ones: a ticked row's "+500 g in Stock"
  // (success), "Not added to Stock" and "Scanned · 700 g" (muted), "Added twice · Sam 50 g, you 50 g" are cut like any hint (P23).
  const pending = ${JSON.stringify(PENDING_ROUTES)}.includes(location.pathname)
  const metas = main ? [...main.querySelectorAll('.list-row__meta-text')] : []
  const reach = pending ? metas.filter((m) => m.closest('.shop-lines') && m.closest('.list-row__meta[data-status="info"]')) : metas
  for (const long of reach) {
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
  // B9-43 (SSP-04): the notice's title ("Not marked Cooked yet") is the sentence's predicate and is never cut: its own text must fit its box (it
  // may wrap, never clip). The slots line below it may clamp to two lines, so it is not read.
  for (const t of (main ? main.querySelectorAll('.shop-notice__title') : [])) {
    if (t.getClientRects().length === 0) continue
    const cut = Math.max(t.scrollWidth - t.clientWidth, t.scrollHeight - t.clientHeight)
    if (cut > 0.5) out.push({ sel: 'p.shop-notice__title', label: t.textContent.trim(), shown: Math.round(t.getBoundingClientRect().width), px: Math.round(cut) })
  }
  return out
})()`

export default { name: 'cut-meta', key: 'cutMeta', order: 60, source: cutMetaProbe, pendingRoutes: PENDING_ROUTES }
