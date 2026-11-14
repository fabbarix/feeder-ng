// Probe "chips" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   clippedChips: [{ sel, label, room }] (P14)
// P14 (ds-plan round 3): a chip whose label is cut by its ellipsis while its chip line still has room to spare. A chip cut because the
// line is really full is not a finding: the spare room is what the line has left after its chips (and their gaps).
const chipProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const label of (main ? main.querySelectorAll('.chip .chip__label') : [])) {
    const chip = label.closest('.chip')
    if (!chip || !vis(label) || label.scrollWidth <= label.clientWidth + 1) continue
    if (getComputedStyle(label).textOverflow !== 'ellipsis') continue
    const line = chip.parentElement
    const cs = getComputedStyle(line)
    const inner = line.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const kids = [...line.children]
    const used = kids.reduce((n, k) => n + k.getBoundingClientRect().width, 0) + (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1)
    const room = Math.round(inner - used)
    if (room > 8) out.push({ sel: sel(chip), label: label.textContent.trim().slice(0, 60), room })
  }
  return out.slice(0, 5)
})()`

export default { name: 'chips', key: 'clippedChips', order: 40, source: chipProbe }
