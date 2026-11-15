// Probe "cook-step" (in-page, B9-40, SHORT-01; P34). It fills
//   cookStep: null | { innerWidth, innerHeight, text: { x, y, r, b } | null, tiles: [{ x, y, r, b }] }
// on the cook-step scenarios only. `text` is the box of the FIRST LINE of the visible Step text (.cook-step__text: the first client rect of its
// text range, which is one line high whatever the Step's length); `tiles` are the visible Back and Next tiles (.cook-nav__tile). P34 asks that
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
  const tiles = [...document.querySelectorAll('.cook-nav__tile')].filter(visible).map((t) => box(t.getBoundingClientRect()))
  return { innerWidth, innerHeight, text, tiles }
})()`

export default { name: 'cook-step', key: 'cookStep', order: 194, scenarios: ['cook-step-landscape', 'cook-step-portrait'], source }
