// Probe "focus-rings" (in-page, B9-07, A11Y-02; P39). It fills
//   focusRings: [{ sel, ring, clippers: [{ sel, box }], neighbours: [{ sel, box }], bars: [{ sel, box }], accentOutlines }]
// only on the focus-ring-room scenarios. Every visible, enabled control of the page (main and an open dialog; up to 120) is focused
// in turn with focusVisible, as Tab would, and scrolled into view as focus does. The element that draws the ring is the focused
// control, or the nearest ancestor that draws an outline (a field frame rings for its input). Its ring box is its border box grown
// by outline width + offset when that is outward (0 for a ring drawn inside). Clippers: its ancestors with a non-visible overflow
// (their padding box), up to the top layer. Neighbours: the other controls whose box meets the ring's painted band (not the
// control itself, its ancestors or its descendants). Bars: sticky and fixed elements that are not its ancestors. accentOutlines:
// how many elements of the focused control's chain (itself, its ancestors and its descendants) draw an outline at once.
const source = `
(() => {
  const scope = document.querySelector('dialog[open]') ?? document.querySelector('main')
  if (!scope) return []
  const CONTROLS = 'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=spinbutton], [role=slider], [role=tab], [role=option], [tabindex="0"]'
  const own = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('') + (e.getAttribute('aria-label') ? '[aria-label="' + e.getAttribute('aria-label').slice(0, 30) + '"]' : e.getAttribute('href')?.startsWith('#') ? '[href="' + e.getAttribute('href') + '"]' : '')
  // An element without a class is named under its nearest classed ancestor, so the finding says where it is.
  const sel = (e) => { if (e.classList.length) return own(e); const a = e.parentElement?.closest('[class]'); return a ? own(a) + ' ' + own(e) : own(e) }
  const box = (r) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom })
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], [inert], [aria-hidden="true"]') }
  const outlined = (e) => { const s = getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !/rgba\\(\\d+, \\d+, \\d+, 0\\)|transparent/.test(s.outlineColor) }
  const controls = [...scope.querySelectorAll(CONTROLS)].filter((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.tabIndex >= 0 && visible(e)).slice(0, 120)
  const bars = [...document.querySelectorAll('body *')].filter((e) => { const p = getComputedStyle(e).position; return (p === 'sticky' || p === 'fixed') && visible(e) })
  const out = []
  for (const el of controls) {
    try { el.focus({ focusVisible: true }) } catch { el.focus() }
    if (document.activeElement !== el || !el.matches(':focus-visible')) continue
    let ringEl = null
    // A visually hidden input (opacity 0: the Checkbox's) draws its ring on the sibling that is its visual (input + .checkbox__box).
    const hidden = parseFloat(getComputedStyle(el).opacity) === 0
    if (hidden && el.nextElementSibling && outlined(el.nextElementSibling)) ringEl = el.nextElementSibling
    for (let p = el; !ringEl && p && p !== document.body; p = p.parentElement) { if (outlined(p) && !(p === el && hidden)) { ringEl = p; break } if (p !== el && p.matches('dialog, .tile, .list-row, .sheet__body')) break }
    if (!ringEl) continue
    const s = getComputedStyle(ringEl)
    const width = parseFloat(s.outlineWidth) || 0, offset = parseFloat(s.outlineOffset) || 0
    const grow = Math.max(0, width + offset)
    const rb = ringEl.getBoundingClientRect()
    const ring = { x: rb.left - grow, y: rb.top - grow, r: rb.right + grow, b: rb.bottom + grow }
    // The painted band: a neighbour strictly inside the band's inner edge does not meet the ring.
    const inner = { x: ring.x + width, y: ring.y + width, r: ring.r - width, b: ring.b - width }
    const clippers = []
    for (let p = ringEl.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p)
      if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
        const r = p.getBoundingClientRect(), l = r.left + p.clientLeft, t = r.top + p.clientTop
        clippers.push({ sel: sel(p), box: { x: ps.overflowX !== 'visible' ? l : -1e9, y: ps.overflowY !== 'visible' ? t : -1e9, r: ps.overflowX !== 'visible' ? l + p.clientWidth : 1e9, b: ps.overflowY !== 'visible' ? t + p.clientHeight : 1e9 } })
      }
      if (p.matches('dialog, [popover]')) break
    }
    const related = (o) => o === el || o === ringEl || o.contains(el) || el.contains(o) || ringEl.contains(o) || o.contains(ringEl)
    const neighbours = []
    for (const o of controls) {
      if (related(o)) continue
      const b = box(o.getBoundingClientRect())
      const meets = ring.x <= b.r && b.x <= ring.r && ring.y <= b.b && b.y <= ring.b
      const insideInner = b.x > inner.x && b.r < inner.r && b.y > inner.y && b.b < inner.b
      if (meets && !insideInner) neighbours.push({ sel: sel(o), box: b })
    }
    // B9-14: a control in an open modal dialog sits in the top layer, over every bar of the page behind it: only the dialog's own bars count.
    const modal = ringEl.closest('dialog[open]')
    const barList = bars.filter((b) => !b.contains(ringEl) && !ringEl.contains(b) && (!modal || modal.contains(b))).map((b) => ({ sel: sel(b), box: box(b.getBoundingClientRect()) }))
    let accentOutlines = 0
    for (let p = el; p && p !== document.body; p = p.parentElement) if (outlined(p) && !(p === el && hidden)) accentOutlines++
    if (ringEl !== el && !ringEl.contains(el) && !el.contains(ringEl)) accentOutlines++
    for (const d of el.querySelectorAll('*')) if (outlined(d)) accentOutlines++
    out.push({ sel: sel(el), ring, clippers, neighbours, bars: barList, accentOutlines })
  }
  document.activeElement?.blur?.()
  scrollTo(0, 0)
  return out
})()`

export default { name: 'focus-rings', key: 'focusRings', order: 180, scenarios: ['focus-ring-room-today', 'focus-ring-room-fields', 'focus-ring-room-sheet', 'recipe-editor-ring-room', 'plan-sheet-choose-ring'], source }
