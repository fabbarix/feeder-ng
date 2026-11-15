// Probe "nav-meta" (in-page, B9-13): fills cutNavMeta: [{ sel, label, lines, cutPx }] (P28).
// A navigation row with metaLines={2}: its meta text is clamped at two lines; scrollHeight above clientHeight is a cut second line.
const navMetaProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const t of (main ? main.querySelectorAll('.list-row[data-meta-lines="2"] .list-row__meta-text') : [])) {
    if (t.getClientRects().length === 0) continue
    const cut = t.scrollHeight - t.clientHeight
    if (cut > 0.5) out.push({ sel: 'span.list-row__meta-text', label: t.textContent.trim().slice(0, 80), lines: 2, cutPx: Math.round(cut) })
  }
  return out
})()`

export default { name: 'nav-meta', key: 'cutNavMeta', order: 175, source: navMetaProbe }
