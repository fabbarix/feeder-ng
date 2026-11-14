// Probe "action-boundary" (in-page, B9-01), moved from scripts/check-page-layout.mjs into the registry by the w0b integration. It fills
//   weakBoundaries: [{ sel, surface, label, ratio }] (P29), and again in the dark-scheme pass (dark: true)
// B9-01 (P29, DS-12 R-A): every action in a tile, toast, sheet footer, dialog or banner has a boundary of at least 3:1 against what it
// sits on: its 1 px inset ring (or border), composited over its own fill, or else its fill. Colours are resolved through a 1x1 canvas,
// so color-mix(), oklab() and color(srgb …) read like rgb(). A disabled action and a link in running text are skipped.
const actionBoundaryProbe = `
(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (c) => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const ratio = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((u, v) => v - u); return (p + 0.05) / (q + 0.05) }
  // what an element sits on: its ancestors' backgrounds composited from the first opaque one (the page is white without one)
  const groundOf = (el) => {
    const layers = []
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    let g = [255, 255, 255, 1]
    for (const c of layers.reverse()) g = over(c, g)
    return g
  }
  const splitTop = (v) => { const out = []; let d = 0, cur = ''; for (const ch of v) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out.map((x) => x.trim()) }
  const ringOf = (cs) => {
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      for (const sh of splitTop(cs.boxShadow)) {
        if (!/inset/.test(sh)) continue
        const lens = (sh.replace(/[a-z-]+[(][^)]*[)]/gi, '').match(/-?[0-9.]+px/g) || []).map(parseFloat)
        const colour = (sh.match(/(rgba?|color|oklab|oklch|lab|lch|hsla?)[(][^)]*[)]/i) || [])[0]
        if (colour && lens.length >= 4 && lens[0] === 0 && lens[1] === 0 && lens[2] === 0 && lens[3] >= 1 && lens[3] <= 4) return colour
      }
    }
    if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none') return cs.borderTopColor
    return null
  }
  const SURFACES = [['.toast', 'toast'], ['.sheet__footer', 'sheet footer'], ['.dialog', 'dialog'], ['.offline-banner', 'banner'], ['.tile', 'tile']]
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll('.button, .icon-button, .close-button, .toast__action, .toast__dismiss')) {
    if (seen.has(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.dataset.variant === 'link') continue
    seen.add(el)
    if (el.getClientRects().length === 0) continue
    const surface = SURFACES.find(([sel]) => el.closest(sel))
    if (!surface) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) continue
    const ground = groundOf(el.parentElement)
    const fill = over(rgba(cs.backgroundColor), ground)
    const ring = ringOf(cs)
    const best = Math.max(ratio(fill, ground), ring ? ratio(over(rgba(ring), fill), ground) : 1)
    if (best < 3) out.push({
      sel: el.tagName.toLowerCase() + '.' + (el.classList[0] || ''), surface: surface[1],
      label: (el.textContent.trim() || el.getAttribute('aria-label') || '').slice(0, 40), ratio: Math.round(best * 100) / 100,
    })
  }
  return out
})()`

export default { name: 'action-boundary', key: 'weakBoundaries', order: 140, dark: true, source: actionBoundaryProbe }
