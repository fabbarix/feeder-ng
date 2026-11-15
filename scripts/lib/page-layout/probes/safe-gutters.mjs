// Probe "safe-gutters" (in-page, B9-19, SHORT-05; P35). It fills
//   safeGutters: { innerWidth, left, right, boxes: [{ sel, x, r }] }
// on the safe-gutters scenarios (the 844x390-inset viewport). left and right are the safe-area insets the page reads (env() through a
// probe element's padding). `boxes` are the visible element boxes inside <main> that are text, controls, images or tiles, horizontally.
const source = `
(() => {
  const main = document.querySelector('main')
  if (!main) return null
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)'
  document.body.append(probe)
  const ps = getComputedStyle(probe)
  const left = parseFloat(ps.paddingLeft) || 0, right = parseFloat(ps.paddingRight) || 0
  probe.remove()
  const own = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('')
  const boxes = []
  for (const e of main.querySelectorAll('h1, h2, h3, p, button, a, input, img, .tile, .list-row, .bento-grid, .page-header__row')) {
    if (e.closest('[hidden], [aria-hidden="true"]')) continue
    const s = getComputedStyle(e)
    if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed') continue
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    boxes.push({ sel: own(e), x: r.left, r: r.right })
  }
  return { innerWidth, left, right, boxes: boxes.slice(0, 400) }
})()`

export default { name: 'safe-gutters', key: 'safeGutters', order: 192, scenarios: ['safe-gutters-today', 'safe-gutters-shop'], source }
