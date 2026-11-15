// Probe "option-cover" (in-page, B9-37, RX-09; P12 extended to the Tag chooser). It fills
//   optionCover: { options: [{ sel, box, top }], bars: [{ sel, box }] }
// only on the recipe-editor-tag-chooser scenario. Options: every option of the open Tag chooser's listbox (aria-label "Tags") whose box is
// inside the listbox's own box (a row scrolled out of the list is not "shown"). `top` is true when the element at the option's centre is
// the option or something inside it: false means something else (a sticky bar, a toast) paints over it. Bars: the visible sticky and
// fixed bars of the page that are not inside the chooser. Box = { x, y, r, b } in px (viewport).
const source = `
(() => {
  const box = (r) => ({ x: r.left, y: r.top, r: r.right, b: r.bottom })
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => '.' + c).join('') + ((e.textContent || '').trim() ? '[' + e.textContent.trim().slice(0, 24) + ']' : '')
  const list = document.querySelector('[role="listbox"][aria-label="Tags"]')
  if (!list) return { options: [], bars: [] }
  const lb = list.getBoundingClientRect()
  const options = []
  for (const o of list.querySelectorAll('[role="option"]')) {
    if (!visible(o)) continue
    const r = o.getBoundingClientRect()
    if (r.top < lb.top - 1 || r.bottom > lb.bottom + 1) continue
    const at = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
    options.push({ sel: sel(o), box: box(r), top: !!at && o.contains(at) })
  }
  const bars = [...document.querySelectorAll('body *')]
    .filter((e) => { const p = getComputedStyle(e).position; return (p === 'sticky' || p === 'fixed') && visible(e) && !e.contains(list) && !list.contains(e) })
    .map((e) => ({ sel: sel(e), box: box(e.getBoundingClientRect()) }))
  return { options, bars }
})()`

export default { name: 'option-cover', key: 'optionCover', order: 340, scenarios: ['recipe-editor-tag-chooser'], source }
