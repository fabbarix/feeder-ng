// Probe "fit-lines" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   fitLines: [{ sel, label, why: 'cut' | 'spill', px }] (P17)
// hf-recipes-filter round 2 (P17 to P20, docs/design/recipes-filter.md 13.6). Each probe is empty on a page without the header.
// P17: a chip line (.filter-chips, the Recipes and the Pantry header) shows a chip cut after its first one, or a chip past its end.
const fitLinesProbe = `
(() => {
  const main = document.querySelector('main')
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const line of (main ? main.querySelectorAll('.filter-chips') : [])) {
    const lr = line.getBoundingClientRect()
    if (lr.width <= 2) continue
    const chips = [...line.children].filter((c) => c.classList.contains('chip'))
    chips.forEach((chip, i) => {
      const r = chip.getBoundingClientRect()
      const label = chip.querySelector('.chip__label')
      const text = label ? label.textContent.trim().slice(0, 60) : ''
      const cut = label ? label.scrollWidth - label.clientWidth : 0
      if (r.width > 2 && r.right > lr.right + 1) out.push({ sel: sel(line), label: text, why: 'spill', px: Math.round(r.right - lr.right) })
      else if (i > 0 && cut > 1) out.push({ sel: sel(line), label: text, why: 'cut', px: Math.round(label.clientWidth) })
    })
  }
  return out.slice(0, 5)
})()`

export default { name: 'fit-lines', key: 'fitLines', order: 90, source: fitLinesProbe }
