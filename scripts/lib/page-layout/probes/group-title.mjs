// Probe "group-title" (in-page, B9-13): fills untitledGroups: [{ sel, label }] (P41): a visible ul.list-group__list named only by
// aria-label, with no visible .list-group__title in its section, that sits beside another .list-group or .list-group-section.
const groupTitleProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const ul of (main ? main.querySelectorAll('ul.list-group__list[aria-label]') : [])) {
    if (ul.getClientRects().length === 0) continue
    const card = ul.closest('.list-group')
    const unit = card && card.closest('.list-group-section') ? card.closest('.list-group-section') : card
    if (!unit || !unit.parentElement) continue
    const siblings = [...unit.parentElement.children].filter((c) => c !== unit && (c.matches('.list-group, .list-group-section') && c.getClientRects().length > 0))
    if (siblings.length === 0) continue
    const title = unit.querySelector('.list-group__title')
    if (title && title.getClientRects().length > 0) continue
    out.push({ sel: 'ul.list-group__list', label: ul.getAttribute('aria-label') })
  }
  return out
})()`

export default { name: 'group-title', key: 'untitledGroups', order: 185, source: groupTitleProbe }
