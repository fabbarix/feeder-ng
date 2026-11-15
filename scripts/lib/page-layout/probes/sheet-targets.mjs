// Probe "sheet-targets" (in-page, B9-14; P25, DS-01 and DS-02). It fills ONE key, sheetMetrics = { sheetTargets, sheetOverlaps, barLabels }:
//   sheetTargets: [{ sel, w, h, hitW, hitH }]       the visible controls of the open modal sheet or dialog; w x h is the border box,
//                                                   hitW x hitH its box united with its ::after box (the 40 px Close has 52), as P36
//   sheetOverlaps: [{ a, b }]                        two of them whose hit boxes overlap by more than 1 px on both axes (nested pairs skipped;
//                                                   each box clipped by its scrolling ancestors in the dialog, so a control scrolled under
//                                                   the sticky footer is not counted; one clipped away entirely is no target)
//   barLabels: [{ text, box }]                       the bottom bar's visible labels (the DS-02 half of P25); box = { x, y, r, b }
// Only on the scenarios below (an opt-in list: the rule is always-fail, so a package adds its scenario name here when its sheets are
// converted; the other sheets of the app keep their findings out of the always-fail set until then).
const source = `
(() => {
  const sel = (e) => { const own = (x) => x.tagName.toLowerCase() + [...x.classList].slice(0, 2).map((c) => '.' + c).join('') + (x.getAttribute('aria-label') ? '[aria-label="' + x.getAttribute('aria-label').slice(0, 30) + '"]' : ''); return e.classList.length || !e.parentElement ? own(e) : (e.parentElement.closest('[class]') ? own(e.parentElement.closest('[class]')) + ' ' : '') + own(e) }
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden], [inert], [aria-hidden="true"]') }
  const out = { sheetTargets: [], sheetOverlaps: [], barLabels: [] }
  const dialog = document.querySelector('dialog[open]:modal') ?? document.querySelector('dialog[open]')
  if (dialog) {
    const CONTROLS = 'button, a[href], input:not([type=hidden]), textarea, select, [role=button], [role=menuitem], [role=menuitemcheckbox], [role=switch], [role=checkbox], [role=radio], [role=combobox], [role=option], [tabindex="0"]'
    // The hit area as B9-16's P36 judges it (probes/targets.mjs): the border box united with the ::after box, read from
    // getComputedStyle(el, '::after') (left and top from the padding edge, the used width and height). The scenarios emulate touch,
    // so the coarse-pointer ::after blocks (A11Y-09) apply.
    const hit = (e) => {
      let t = e
      // A visually hidden input (the Checkbox's, the Switch's) is operated through its label: measure that.
      if (parseFloat(getComputedStyle(e).opacity) === 0 && e.closest('label')) t = e.closest('label')
      const r = t.getBoundingClientRect()
      let box = { x: r.left, y: r.top, r: r.right, b: r.bottom }
      const a = getComputedStyle(t, '::after')
      if (a.content && a.content !== 'none' && a.position === 'absolute') {
        const x = r.left + t.clientLeft + (parseFloat(a.left) || 0), y = r.top + t.clientTop + (parseFloat(a.top) || 0)
        const w = parseFloat(a.width), h = parseFloat(a.height)
        if (Number.isFinite(w) && Number.isFinite(h)) box = { x: Math.min(box.x, x), y: Math.min(box.y, y), r: Math.max(box.r, x + w), b: Math.max(box.b, y + h) }
      }
      return { el: e, r, w: r.width, h: r.height, hitW: box.r - box.x, hitH: box.b - box.y, box }
    }
    // A Stepper's value (a span role=spinbutton) takes the keyboard, not a tap: its ± buttons are the pointer targets.
    const pointerTarget = (e) => !(e.getAttribute('role') === 'spinbutton' && e.tagName !== 'INPUT')
    // A sheet's body scrolls under its sticky footer: a control scrolled out of the body is not tappable there, so each hit box is
    // clipped by its overflow-clipping ancestors inside the dialog (their padding boxes), and a target clipped away entirely is left out.
    // Sizes are still judged on the whole hit box (a control half scrolled away is not a small target); overlaps on the clipped one.
    const clip = (t) => {
      let box = { ...t.box }
      for (let a = t.el.parentElement; a && dialog.contains(a); a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
        const r = a.getBoundingClientRect()
        const p = { x: r.left + a.clientLeft, y: r.top + a.clientTop, r: r.left + a.clientLeft + a.clientWidth, b: r.top + a.clientTop + a.clientHeight }
        if (cs.overflowX !== 'visible') box = { ...box, x: Math.max(box.x, p.x), r: Math.min(box.r, p.r) }
        if (cs.overflowY !== 'visible') box = { ...box, y: Math.max(box.y, p.y), b: Math.min(box.b, p.b) }
        if (a === dialog) break
      }
      return { ...t, box, shown: box.r - box.x > 1 && box.b - box.y > 1 }
    }
    const all = [...dialog.querySelectorAll(CONTROLS)].filter((e) => pointerTarget(e) && (!e.disabled && visible(e) && e.tabIndex >= 0 || (e.matches('.list-row__target') && visible(e)))).slice(0, 80).map(hit).map(clip).filter((t) => t.shown)
    for (const t of all) out.sheetTargets.push({ sel: sel(t.el), w: Math.round(t.w * 10) / 10, h: Math.round(t.h * 10) / 10, hitW: Math.round(t.hitW * 10) / 10, hitH: Math.round(t.hitH * 10) / 10 })
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      const ox = Math.min(a.box.r, b.box.r) - Math.max(a.box.x, b.box.x), oy = Math.min(a.box.b, b.box.b) - Math.max(a.box.y, b.box.y)
      if (ox > 1 && oy > 1) out.sheetOverlaps.push({ a: sel(a.el), b: sel(b.el) })
    }
  }
  for (const l of document.querySelectorAll('.bottom-bar__label')) {
    if (!visible(l)) continue
    const r = l.getBoundingClientRect()
    out.barLabels.push({ text: l.textContent.trim(), box: { x: r.left, y: r.top, r: r.right, b: r.bottom } })
  }
  return out
})()`

// The probe fills one key; the three metrics ride in it.
export default {
  name: 'sheet-targets',
  key: 'sheetMetrics',
  order: 200,
  soft: true,
  scenarios: ['leftover-menu-sheet', 'sheet-planned-meal', 'sheet-add-member', 'sheet-short-landscape', 'sheet-zoom-400'],
  source,
}
