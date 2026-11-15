// Probe "clipped-rings" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   clippedRings: [{ sel, label, what: 'focus ring' | 'hit area', px }] (P18)
// P18: a focus ring (3 px outline, 2 px offset) or a removable chip's hit area (its ::before, reaching past it) cut by a clipping
// ancestor. Each chip is focused with focusVisible so its ring is drawn. A chip scrolled partly out of its own scroll container is skipped.
const clippedRingsProbe = `
(() => {
  const main = document.querySelector('main')
  const modal = document.querySelector('dialog[open]:modal')
  if (!main && !modal) return []
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const bounds = (el) => {
    const out = []
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      // A dialog or a popover is in the top layer: the page's ancestors above it do not clip it.
      if (p.matches('dialog, [popover]')) break
      const s = getComputedStyle(p)
      const xClip = s.overflowX !== 'visible', yClip = s.overflowY !== 'visible'
      if (!xClip && !yClip) continue
      const r = p.getBoundingClientRect()
      const l = r.left + p.clientLeft, t = r.top + p.clientTop
      const m = parseFloat(s.overflowClipMargin) || 0
      const mx = s.overflowX === 'clip' ? m : 0, my = s.overflowY === 'clip' ? m : 0
      out.push({ l: xClip ? l - mx : -Infinity, r: xClip ? l + p.clientWidth + mx : Infinity, t: yClip ? t - my : -Infinity, b: yClip ? t + p.clientHeight + my : Infinity, scroller: out.length === 0 })
    }
    return out
  }
  const worst = (rect, list) => Math.max(0, ...list.map((c) => Math.max(c.l - rect.l, rect.r - c.r, c.t - rect.t, rect.b - c.b)))
  const out = []
  // The chip line of both headers, and the chip lines of an open Filters panel (Course; the Pantry's Show and Kind).
  const targets = [...(main ? main.querySelectorAll('.filter-chips > .chip, .course-filter > .chip, .filter-chip-group > .chip') : [])]
  // B9-14 (P18 extended to sheet and dialog bodies): the controls of an open modal's body (fields, chips, buttons, steppers).
  const inModal = new Set()
  if (modal) {
    const bodies = [...modal.querySelectorAll('.sheet__body, .dialog__body')]
    const controls = bodies.flatMap((b) => [...b.querySelectorAll('button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role=combobox], [role=switch], .chip')]).slice(0, 24)
    for (const c of controls) { targets.push(c); inModal.add(c) }
  }
  for (const el of targets) {
    if (el.getBoundingClientRect().width <= 2) continue
    // A control of a sheet body is scrolled to as focus does (nearest), so the body's own scroll position does not read as a cut.
    if (inModal.has(el)) el.scrollIntoView({ block: 'nearest' })
    el.focus({ focusVisible: true })
    const r = el.getBoundingClientRect()
    const list = bounds(el)
    const scroller = list.find((c) => c.scroller)
    if (scroller && (r.left < scroller.l - 0.5 || r.right > scroller.r + 0.5)) continue
    const label = el.textContent.trim().slice(0, 40)
    const ring = worst({ l: r.left - 5, r: r.right + 5, t: r.top - 5, b: r.bottom + 5 }, list)
    if (Math.round(ring) >= 1) out.push({ sel: sel(el), label, what: 'focus ring', px: Math.round(ring) })
    const before = getComputedStyle(el, '::before')
    if (el.matches('.chip[data-removable]') && before.position === 'absolute') {
      const ext = Math.max(0, -parseFloat(before.top) || 0, -parseFloat(before.bottom) || 0)
      const hit = worst({ l: r.left, r: r.right, t: r.top - ext, b: r.bottom + ext }, list)
      if (ext > 0 && Math.round(hit) >= 1) out.push({ sel: sel(el), label, what: 'hit area', px: Math.round(hit) })
    }
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
  return out.slice(0, 8)
})()`

export default { name: 'clipped-rings', key: 'clippedRings', order: 100, source: clippedRingsProbe }
