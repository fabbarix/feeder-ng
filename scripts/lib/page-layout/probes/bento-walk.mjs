// Probe "bento-walk" (in-page, B9-07, DS-09; P26). It fills
//   bentoWalk: [{ sel, samples: [{ w, cols }] }]   samples in ascending width
// only on the today-columns scenario. The facade's RESIZE_WALKS table is shared, so the walk runs inside the page: the same URL in a
// same-origin iframe, widened from 900 to 1320 px in 20 px steps (the plan's walk: { route: '/', from: 900, to: 1320, step: 20 }).
// The iframe's own viewport is its width, so the media queries, the rail and useBreakpoint answer for it. At each width every
// .bento-grid's column count is read from its computed grid-template-columns (the tracks wider than 0: auto-fit collapses empty ones).
export const WALK = { from: 900, to: 1320, step: 20, height: 900 }

const source = `
(async () => {
  const W = ${JSON.stringify(WALK)}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:absolute;left:-20000px;top:0;border:0;height:' + W.height + 'px;width:' + W.from + 'px'
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }))
  frame.src = location.href
  document.body.appendChild(frame)
  try {
    await loaded
    const doc = () => frame.contentDocument
    const ready = () => { const d = doc(); return !!d && d.readyState === 'complete' && d.querySelector('main .bento-grid') && !d.querySelector('[aria-busy="true"], .skeleton') }
    for (let t = 0; t < 100 && !ready(); t++) await sleep(100)
    if (!ready()) throw new Error('bento-walk: the page in the walk frame did not show a .bento-grid')
    await sleep(300)
    const name = (g, i, all) => {
      const base = 'div.' + [...g.classList].slice(0, 2).join('.') + (g.getAttribute('aria-label') ? '[aria-label="' + g.getAttribute('aria-label') + '"]' : '')
      return all.filter((x) => x.base === base).length > 1 ? base + ':nth(' + i + ')' : base
    }
    const grids = new Map()
    for (let w = W.from; w <= W.to; w += W.step) {
      frame.style.width = w + 'px'
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await sleep(120)
      const list = [...doc().querySelectorAll('main .bento-grid')].filter((g) => g.getBoundingClientRect().width > 0)
      const bases = list.map((g) => ({ base: 'div.' + [...g.classList].slice(0, 2).join('.') + (g.getAttribute('aria-label') ? '[aria-label="' + g.getAttribute('aria-label') + '"]' : '') }))
      list.forEach((g, i) => {
        const sel = name(g, i, bases)
        const cols = frame.contentWindow.getComputedStyle(g).gridTemplateColumns.split(' ').filter((t) => parseFloat(t) > 0).length
        if (!grids.has(sel)) grids.set(sel, [])
        grids.get(sel).push({ w, cols })
      })
    }
    return [...grids].map(([sel, samples]) => ({ sel, samples }))
  } finally {
    frame.remove()
  }
})()`

export default { name: 'bento-walk', key: 'bentoWalk', order: 170, scenarios: ['today-columns'], source }
