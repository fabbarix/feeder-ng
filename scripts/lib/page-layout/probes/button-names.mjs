// Probe "button-names" (in-page, B9-32, A11Y-08): fills duplicateButtonNames: [{ name, count }] (P38). Within `main`, the visible buttons
// (role button, any element: <button>, [role=button], a .list-row__target) are grouped by accessible name (aria-label, else the text).
// A name that two or more buttons share is a finding unless EVERY button that has it is a row target (.list-row__target) and their
// descriptions (the text of the elements their aria-describedby names) all differ: "Flour" twice is fine when one is "500 g" and the
// other "1 kg"; "Swap" twice never is. The toast live regions and anything hidden are not counted.
const buttonNamesProbe = `
(() => {
  const main = document.querySelector('main')
  if (!main) return []
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'
  const nameOf = (e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').replace(/\\s+/g, ' ').trim()
  const describe = (e) => (e.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').replace(/\\s+/g, ' ').trim()
  const byName = new Map()
  for (const b of main.querySelectorAll('button, [role="button"], a.list-row__target')) {
    if (!shown(b) || b.closest('.toast-live, [hidden], [inert]')) continue
    const n = nameOf(b)
    if (!n) continue
    byName.set(n, [...(byName.get(n) ?? []), b])
  }
  const out = []
  for (const [name, list] of byName) {
    if (list.length < 2) continue
    const rows = list.every((b) => b.classList.contains('list-row__target'))
    const ds = list.map(describe)
    if (rows && new Set(ds).size === list.length && ds.every(Boolean)) continue
    out.push({ name: name.slice(0, 60), count: list.length })
  }
  return out.slice(0, 8)
})()`

export default { name: 'button-names', key: 'duplicateButtonNames', order: 700, source: buttonNamesProbe }
