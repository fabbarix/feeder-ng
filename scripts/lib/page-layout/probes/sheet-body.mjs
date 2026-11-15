// Probe "sheet-body" (in-page, B9-14; P33, SHORT-02). It fills
//   sheetBody: { sel, bodyH, bodyScroll, panelH, innerHeight, flow, firstControl: { sel, clipped } | null, footerVisible } | null
// for the open modal sheet: the .sheet__body's client and scroll heights, the panel's, whether data-footer="flow" is set, the sheet's first
// required control (else its first control) and whether it is cut by a clipping ancestor inside the dialog (its box outside the
// clipper's padding box by more than 1 px, at scrollTop 0), and whether any control of the footer is on screen.
const source = `
(() => {
  const dialog = document.querySelector('dialog.sheet[open]:modal')
  if (!dialog) return null
  const body = dialog.querySelector('.sheet__body'), panel = dialog.querySelector('.sheet__panel'), footer = dialog.querySelector('.sheet__footer')
  if (!body || !panel) return null
  const CONTROLS = 'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role=combobox], [role=button], [tabindex="0"]'
  const name = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('') + (e.getAttribute('aria-label') ? '[aria-label="' + e.getAttribute('aria-label').slice(0, 30) + '"]' : '')
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden' }
  const inView = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
  const required = body.querySelector('[required], [aria-required="true"]')
  const first = [...(required ? [required] : []), ...body.querySelectorAll(CONTROLS)].find(shown) ?? null
  let firstControl = null
  if (first) {
    const r = first.getBoundingClientRect()
    let clipped = false
    for (let p = first.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const b = p.getBoundingClientRect()
        const top = b.top + p.clientTop, bottom = top + p.clientHeight
        if (s.overflowY !== 'visible' && (r.top < top - 1 || r.bottom > bottom + 1)) clipped = true
      }
      if (p === dialog) break
    }
    firstControl = { sel: name(first), clipped }
  }
  const footerVisible = !!footer && [...footer.querySelectorAll(CONTROLS)].some((e) => shown(e) && inView(e.getBoundingClientRect()))
  return { sel: name(dialog), bodyH: body.clientHeight, bodyScroll: body.scrollHeight, panelH: panel.clientHeight, innerHeight, flow: panel.dataset.footer === 'flow', firstControl, footerVisible }
})()`

export default { name: 'sheet-body', key: 'sheetBody', order: 210, soft: true, scenarios: ['leftover-menu-sheet', 'sheet-planned-meal', 'sheet-add-member', 'sheet-short-landscape', 'sheet-zoom-400', 'plan-sheet-actions', 'plan-sheet-mark-cooked', 'plan-sheet-swap', 'plan-sheet-choose', 'plan-sheet-whos-eating'], source }
