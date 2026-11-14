// Probe "cut-selects" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   cutSelects: [{ sel, label, shown, px }] (P22; also read at each width of the resize walk)
// pantry-filter review (P22): a chip Select (a toolbar picker: the Sort of both filter headers, Shop's) whose value is cut by its ellipsis.
// The value's text is measured with a Range (its laid-out width, whatever the ellipsis paints) and by its scroll overflow.
const cutSelectProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const v of (main ? main.querySelectorAll('.select__trigger[data-appearance="chip"] .select__value') : [])) {
    if (v.getClientRects().length === 0) continue
    const box = v.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(v)
    const cut = Math.max(v.scrollWidth - v.clientWidth, range.getBoundingClientRect().width - box.width)
    if (cut > 0.5) out.push({ sel: 'button.select__trigger', label: v.textContent.trim(), shown: Math.round(box.width), px: Math.round(cut) })
  }
  return out
})()`

export default { name: 'cut-selects', key: 'cutSelects', order: 130, source: cutSelectProbe }
