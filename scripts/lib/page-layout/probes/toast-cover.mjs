// Probe "toast-cover" (in-page, B9-18, SSP-12; P43). It fills
//   toastCover: { toasts: [{ sel, box }], targets: [{ kind, sel, box }] }
// only on the toast-pricing and toast-over-bar scenarios. Toasts: every visible .toast. Targets: the [data-pricing] row (the Price
// keypad's row), the row that has focus (a .list-row holding document.activeElement), the bottom bar and any sticky action bar.
// Box = { x, y, r, b } in px (viewport).
const source = `
(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom } }
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('')
  const toasts = [...document.querySelectorAll('.toast')].filter(visible).map((e) => ({ sel: sel(e) + (e.dataset.status ? '[data-status=' + e.dataset.status + ']' : ''), box: box(e) }))
  const targets = []
  for (const e of document.querySelectorAll('[data-pricing]')) if (visible(e)) targets.push({ kind: 'pricing', sel: '[data-pricing] ' + sel(e), box: box(e) })
  const row = document.activeElement && document.activeElement !== document.body ? document.activeElement.closest('.list-row') : null
  if (row && visible(row) && !row.matches('[data-pricing]')) targets.push({ kind: 'focused-row', sel: sel(row), box: box(row) })
  for (const e of document.querySelectorAll('nav.bottom-bar')) if (visible(e)) targets.push({ kind: 'bottom-bar', sel: sel(e), box: box(e) })
  for (const e of document.querySelectorAll('.sticky-action-bar')) if (visible(e)) targets.push({ kind: 'sticky-bar', sel: sel(e), box: box(e) })
  return { toasts, targets }
})()`

export default { name: 'toast-cover', key: 'toastCover', order: 330, source, scenarios: ['toast-pricing', 'toast-over-bar'] }
