// Probe "group-title" (in-page, B9-13): fills untitledGroups: [{ sel, label }] (P41): a visible ul.list-group__list named only by
// aria-label, with no visible .list-group__title in its section, that sits beside another .list-group or .list-group-section, and
// has no visible heading directly before it. A list named by aria-label is fine where its heading is already on screen right above
// it (a tile or section title: the main session's ruling on SSP-03); the heading may be the previous sibling or inside it (a header
// row), never inside a previous group.
const groupTitleProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  const shown = (el) => el.getClientRects().length > 0
  const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"]'
  const headingBefore = (unit) => {
    let p = unit.previousElementSibling
    while (p && !shown(p)) p = p.previousElementSibling
    if (!p || p.matches('.list-group, .list-group-section')) return null
    const h = p.matches(HEADING) ? p : [...p.querySelectorAll(HEADING)].filter(shown).pop()
    return h && h.textContent.trim() ? h : null
  }
  for (const ul of (main ? main.querySelectorAll('ul.list-group__list[aria-label]') : [])) {
    if (!shown(ul)) continue
    const card = ul.closest('.list-group')
    const unit = card && card.closest('.list-group-section') ? card.closest('.list-group-section') : card
    if (!unit || !unit.parentElement) continue
    const siblings = [...unit.parentElement.children].filter((c) => c !== unit && c.matches('.list-group, .list-group-section') && shown(c))
    if (siblings.length === 0) continue
    const title = unit.querySelector('.list-group__title')
    if (title && shown(title)) continue
    if (headingBefore(unit)) continue
    out.push({ sel: 'ul.list-group__list', label: ul.getAttribute('aria-label') })
  }
  return out
})()`

export default { name: 'group-title', key: 'untitledGroups', order: 185, source: groupTitleProbe }
