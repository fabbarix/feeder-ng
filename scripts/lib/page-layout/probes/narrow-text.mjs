// Probe "narrow-text" (in-page, B9-13): fills narrowText: [{ sel, label, width }] (P40): every visible .list-row__title and field
// error (.ui-field__error) with its painted width. A title that is clipped to a few letters is the finding.
const narrowTextProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const el of (main ? main.querySelectorAll('.list-row__title, .ui-field__error') : [])) {
    if (el.getClientRects().length === 0 || !el.textContent.trim()) continue
    out.push({ sel: el.classList.contains('ui-field__error') ? 'p.ui-field__error' : 'span.list-row__title', label: el.textContent.trim().slice(0, 60), width: el.getBoundingClientRect().width })
  }
  return out
})()`

export default { name: 'narrow-text', key: 'narrowText', order: 180, source: narrowTextProbe }
