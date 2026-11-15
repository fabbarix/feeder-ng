// Probe "sheet-targets" (in-page, B9-14; P25, DS-01 and DS-02). It fills ONE key, sheetMetrics = { sheetTargets, sheetOverlaps, barLabels }:
//   sheetTargets: [{ sel, w, h, hitW, hitH }]       the visible controls of the open modal sheet or dialog; w x h is the border box,
//                                                   hitW x hitH the larger of it and the ::after that extends it (the 40 px Close has 52)
//   sheetOverlaps: [{ a, b }]                        two of them whose hit boxes overlap by more than 1 px on both axes (nested pairs skipped)
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
    const hit = (e) => {
      let t = e
      // A visually hidden input (the Checkbox's, the Switch's) is operated through its label: measure that.
      if (parseFloat(getComputedStyle(e).opacity) === 0 && e.closest('label')) t = e.closest('label')
      const r = t.getBoundingClientRect()
      const a = getComputedStyle(t, '::after')
      const aw = a.position === 'absolute' ? parseFloat(a.width) || 0 : 0
      const ah = a.position === 'absolute' ? parseFloat(a.height) || 0 : 0
      const w = Math.max(r.width, aw), h = Math.max(r.height, ah)
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      return { el: e, r, w: r.width, h: r.height, hitW: w, hitH: h, box: { x: cx - w / 2, y: cy - h / 2, r: cx + w / 2, b: cy + h / 2 } }
    }
    const all = [...dialog.querySelectorAll(CONTROLS)].filter((e) => !e.disabled && visible(e) && e.tabIndex >= 0 || (e.matches('.list-row__target') && visible(e))).slice(0, 80).map(hit)
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
