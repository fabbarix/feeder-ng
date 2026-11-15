// Probe "row-overlap" (in-page, B9-13): fills rowOverlap: [{ sel, label, titleBottom, metaTop }] (P24).
// The title's painted bottom is top + scrollHeight when its overflow is visible (every line paints), else its clientHeight (clipped).
const rowOverlapProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const row of (main ? main.querySelectorAll('.list-row') : [])) {
    if (row.getClientRects().length === 0) continue
    const title = row.querySelector(':scope .list-row__title')
    const meta = row.querySelector(':scope .list-row__meta')
    if (!title || !meta || title.getClientRects().length === 0 || meta.getClientRects().length === 0) continue
    const t = title.getBoundingClientRect()
    const visible = getComputedStyle(title).overflowY === 'visible'
    const height = visible ? Math.max(title.scrollHeight, t.height) : title.clientHeight
    out.push({ sel: 'li.list-row', label: title.textContent.trim().slice(0, 60), titleBottom: t.top + height, metaTop: meta.getBoundingClientRect().top })
  }
  return out
})()`

export default { name: 'row-overlap', key: 'rowOverlap', order: 170, source: rowOverlapProbe }
