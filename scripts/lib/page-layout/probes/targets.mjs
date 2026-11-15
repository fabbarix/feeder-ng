// Probe "targets" (in-page, B9-16, A11Y-09; P36). It fills
//   targets: { coarse, items: [{ i, sel, w, h, hit: { x, y, r, b }, anc: [i...], inline }] } | null
// only on the touch-targets scenarios. coarse is matchMedia('(pointer: coarse)'): the scenarios emulate touch, so it is true there; on
// a page that is not coarse the probe reports coarse false and the rule says nothing. Every visible, enabled control of main (or an open
// dialog) is measured: its border box united with its ::after box. A pseudo-element box is read from getComputedStyle(el, '::after'):
// width and height are the used size of the absolutely positioned box, left and top its offset from the control's padding edge.
const source = `
(() => {
  const coarse = matchMedia('(pointer: coarse)').matches
  const scope = document.querySelector('dialog[open]') ?? document.querySelector('main')
  if (!scope) return null
  const CONTROLS = 'button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button], [role=switch], [role=checkbox], [role=radio], [role=tab], [role=slider], [role=spinbutton], [role=combobox], [role=option], [role=menuitem]'
  const own = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('') + (e.getAttribute('aria-label') ? '[aria-label="' + e.getAttribute('aria-label').slice(0, 30) + '"]' : '')
  const sel = (e) => { if (e.classList.length) return own(e); const a = e.parentElement?.closest('[class]'); return a ? own(a) + ' ' + own(e) : own(e) }
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], [inert], [aria-hidden="true"]') }
  const controls = [...scope.querySelectorAll(CONTROLS)].filter((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true' && shown(e) && parseFloat(getComputedStyle(e).opacity) > 0).slice(0, 300)
  const hitBox = (e) => {
    const r = e.getBoundingClientRect()
    let box = { x: r.left, y: r.top, r: r.right, b: r.bottom }
    const a = getComputedStyle(e, '::after')
    if (a.content && a.content !== 'none' && a.position === 'absolute') {
      const x = r.left + e.clientLeft + (parseFloat(a.left) || 0)
      const y = r.top + e.clientTop + (parseFloat(a.top) || 0)
      const w = parseFloat(a.width), h = parseFloat(a.height)
      if (Number.isFinite(w) && Number.isFinite(h)) box = { x: Math.min(box.x, x), y: Math.min(box.y, y), r: Math.max(box.r, x + w), b: Math.max(box.b, y + h) }
    }
    return box
  }
  const items = controls.map((e, i) => {
    const r = e.getBoundingClientRect()
    const inline = e.tagName === 'A' && getComputedStyle(e).display === 'inline' && !!e.closest('p, li, dd, span, label')
    return { i, sel: sel(e), w: r.width, h: r.height, hit: hitBox(e), anc: [], inline, el: e }
  })
  for (const it of items) for (const other of items) if (other !== it && other.el.contains(it.el)) it.anc.push(other.i)
  return { coarse, items: items.map(({ el, ...rest }) => rest) }
})()`

export default { name: 'targets', key: 'targets', order: 400, scenarios: ['touch-targets-controls'], source }
