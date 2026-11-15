// Probe "bottom-bar-squircles" (in-page, B9-19, DS-02 / R-F; P31). It fills
//   barSquircles: null (no visible bottom bar) | { bar: Box, links: [{ label, current, accent, icon: Box | null }] }
// only on the `bottom-bar` scenario. A link's `icon` is the box of its `.bottom-bar__icon` span (null when the link has none: the
// markup of R-F is missing); Box = { x, y, r, b, w, h } in px. The rule judges them (rules/P31-bottom-bar-squircle.mjs).
const source = `
(() => {
  const bar = document.querySelector('nav.bottom-bar')
  if (!bar) return null
  const bb = bar.getBoundingClientRect()
  if (bb.width === 0 || bb.height === 0 || getComputedStyle(bar).visibility === 'hidden') return null
  const box = (r) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height })
  const links = [...bar.querySelectorAll('.bottom-bar__link')].map((a) => {
    const icon = a.querySelector('.bottom-bar__icon')
    return {
      label: (a.querySelector('.bottom-bar__label')?.textContent ?? a.getAttribute('aria-label') ?? '').trim(),
      current: a.getAttribute('aria-current') === 'page',
      accent: a.getAttribute('data-accent') === 'true',
      icon: icon ? box(icon.getBoundingClientRect()) : null,
    }
  })
  return { bar: box(bb), links }
})()`

export default { name: 'bottom-bar-squircles', key: 'barSquircles', order: 190, scenarios: ['bottom-bar'], source }
