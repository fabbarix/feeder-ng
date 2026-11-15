// Probe "chrome-budget" (in-page, B9-19, SHORT-04; P32). It fills
//   chromeBudget: { innerHeight, boxes: [{ sel, y, b }] }
// on the chrome scenarios only. `boxes` are the visible `position: fixed|sticky` elements outside dialogs that are horizontal chrome (wider
// than tall: a bar; a rail is a column beside the content, not over it), clipped to the viewport, in px from the top. A `position:
// static` bar (very short viewports, SHORT-04) is not fixed or sticky and so is not counted. The rule takes the union of their heights.
const source = `
(() => {
  const own = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('')
  const boxes = []
  for (const e of document.querySelectorAll('body *')) {
    const s = getComputedStyle(e)
    if (s.position !== 'fixed' && s.position !== 'sticky') continue
    if (s.visibility === 'hidden' || e.closest('dialog, [popover], [hidden], [aria-hidden="true"]')) continue
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || r.width <= r.height) continue
    const y = Math.max(0, r.top), b = Math.min(innerHeight, r.bottom)
    if (b > y) boxes.push({ sel: own(e), y, b })
  }
  return { innerHeight, boxes }
})()`

export default { name: 'chrome-budget', key: 'chromeBudget', order: 191, scenarios: ['chrome-landscape', 'chrome-landscape-editor', 'chrome-landscape-detail', 'chrome-zoom-editor', 'chrome-zoom-detail'], source }
