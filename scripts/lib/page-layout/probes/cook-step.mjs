// Probe "cook-step" (in-page, B9-40, SHORT-01; P34). It fills
//   cookStep: null | { innerWidth, innerHeight, text: { x, y, r, b } | null, tiles: [{ x, y, r, b }] }
// on the cook-step scenarios only. `text` is the box of the FIRST LINE of the visible Step text (.cook-step__text: the first client rect of its
// text range, which is one line high whatever the Step's length); `tiles` are the visible boxes of the sticky nav (the band, Back and Next, the strip
// and the held line). P34 asks that
// at least 80 % of that line is inside the viewport and outside every tile at load (the beta.8 look: the Step at y 359 under a nav at y 248).
const source = `
(() => {
  const el = document.querySelector('.cook-step__text')
  const box = (r) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom })
  const visible = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 }
  let text = null
  if (el && visible(el)) {
    const range = document.createRange()
    range.selectNodeContents(el)
    const first = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0)
    text = box(first ?? el.getBoundingClientRect())
  }
  // B9-40 review: everything opaque of the sticky nav covers the Step, not only Back and Next: in portrait the nav band itself (its strip of
  // pills and its held line sit above the tiles), in short landscape (.cook-nav is display: contents, no box) the tiles, the strip and the line.
  const tiles = [...document.querySelectorAll('.cook-nav, .cook-nav__tile, .cook-nav .cook-strip, .cook-nav__held')].filter(visible).map((t) => box(t.getBoundingClientRect()))
  return { innerWidth, innerHeight, text, tiles }
})()`

export default { name: 'cook-step', key: 'cookStep', order: 194, scenarios: ['cook-step-landscape', 'cook-step-portrait'], source }
