// Probe "buttons" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   lowContrastButtons: [{ label, ratio }] (P10; the dark pass fills lowContrastButtonsDark with the same probe)
// P10 (run once per colour scheme): a visible, enabled Button label against the first non-transparent background at or above it (alpha is ignored, as in rule P7).
const buttonProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const bgOf = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (rgb(c)[3] !== 0) return c } return getComputedStyle(document.body).backgroundColor }
  const low = []
  for (const b of (main ? main.querySelectorAll('.button:not(:disabled)') : [])) {
    if (!vis(b)) continue
    const ratio = Math.round(contrast(getComputedStyle(b).color, bgOf(b)) * 100) / 100
    if (ratio < 4.5) low.push({ label: b.innerText.trim().slice(0, 40), ratio })
  }
  return low
})()`

export default { name: 'buttons', key: 'lowContrastButtons', order: 10, source: buttonProbe }
