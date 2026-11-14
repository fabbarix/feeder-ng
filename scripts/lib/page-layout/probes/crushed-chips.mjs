// Probe "crushed-chips" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   crushedChips: [{ sel, label, px }] (P16)
// hf-recipes-filter (P16): a visible chip whose label is crushed: the chip is on screen, its label is cut by its ellipsis, and the label is
// narrower than 24 px while its text is longer. The chip is what is checked for visibility, not the label: a label squeezed to 0 px is
// hidden by its own box and would otherwise be skipped.
const crushedProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const chip of (main ? main.querySelectorAll('.chip') : [])) {
    if (!vis(chip)) continue
    const label = chip.querySelector('.chip__label')
    if (!label || !(label.clientWidth < 24) || label.scrollWidth <= label.clientWidth + 1) continue
    if (getComputedStyle(label).textOverflow !== 'ellipsis') continue
    out.push({ sel: sel(chip), label: label.textContent.trim().slice(0, 60), px: Math.round(label.clientWidth) })
  }
  return out.slice(0, 5)
})()`

export default { name: 'crushed-chips', key: 'crushedChips', order: 50, source: crushedProbe }
