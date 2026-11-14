// Probe "one-line" (in-page, B9-01), moved from scripts/check-page-layout.mjs into the registry by the w0b integration. It fills
//   wrappedOptions: [{ sel, label, lines }] (P30)
// B9-01 (P30): a Segmented option (and a button marked [data-one-line]) whose label is laid out on more than one line. The lines are
// counted from the label's text rects, so a tall button with a one-line label is fine.
const oneLineProbe = `
(() => {
  const out = []
  for (const el of document.querySelectorAll('.segmented__option, .segmented [role="radio"], button[data-one-line], .button[data-one-line]')) {
    if (el.getClientRects().length === 0) continue
    const tops = new Set()
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top))
    }
    // rects of one line can differ by a pixel (mixed fonts); lines are at least 8 px apart
    const lines = [...tops].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] >= 8).length
    if (lines > 1) out.push({ sel: el.tagName.toLowerCase() + '.' + (el.classList[0] || ''), label: el.textContent.trim().slice(0, 40), lines })
  }
  return out
})()`

export default { name: 'one-line', key: 'wrappedOptions', order: 150, source: oneLineProbe }
