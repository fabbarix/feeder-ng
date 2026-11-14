// Probe "tiles" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   tileOverflow: [{ sel, card, px }] (P13)
// P13 (DS-A round 2, system.md 10): a box whose content is wider than its tile or card (.tile, .list-group) and spills past it. A scroll
// container (overflow-x auto or scroll) between the box and its card is intentional and not counted; clipping by overflow hidden is.
const tileProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  // round 3: named by the class attribute (an svg's className is an SVGAnimatedString)
  const sel = (e) => e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '').split(' ')[0]
  const out = []
  for (const card of (main ? main.querySelectorAll('.tile, .list-group') : [])) {
    if (!vis(card)) continue
    const cs = getComputedStyle(card)
    const edge = card.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
    for (const d of card.querySelectorAll('*')) {
      if (!vis(d)) continue
      const over = d.getBoundingClientRect().right - edge
      if (over <= 1) continue
      // round 3: only in-flow spills count. A position: absolute or fixed box (a corner menu in the tile's padding) is not one, and
      // neither is anything inside it; a scroll container (overflow-x auto / scroll) between the box and its card is intentional.
      let scrolled = false
      for (let p = d; p && p !== card; p = p.parentElement) {
        const ps = getComputedStyle(p).position
        if (ps === 'absolute' || ps === 'fixed') { scrolled = true; break }
      }
      for (let p = d.parentElement; !scrolled && p && p !== card; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll') { scrolled = true; break }
      }
      if (!scrolled) out.push({ sel: sel(d), card: sel(card), px: Math.round(over) })
    }
  }
  return out.slice(0, 3)
})()`

export default { name: 'tiles', key: 'tileOverflow', order: 30, source: tileProbe }
