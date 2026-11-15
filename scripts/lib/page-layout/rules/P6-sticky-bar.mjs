// P6 (warn or fail by the route mode): A sticky action bar has a background and lines up with the page content.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P6', message: `P6 ${text}` })

/** The box a bar lines up with: its capped column centred in the content box, or the content box itself. */
function columnOf(b, edge) {
  if (!b.column || !(b.cap > 0)) return edge
  const w = edge.r - edge.x
  if (b.cap >= w) return edge
  const x = Math.round(edge.x + (w - b.cap) / 2)
  return { x, r: x + b.cap }
}

export default {
  id: 'P6',
  title: 'A sticky action bar has a background and lines up with the page content',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // The bar floats inside the gutters, so it lines up with the container's content box (containerInner) when the probe reports it.
    // B9-19 (SHORT-08): a bar capped to its form column (data-column narrow or form, with its cap) lines up with that column instead:
    // the cap, centred in the content box, or the whole content box when the box is narrower than the cap.
    const edge = m.containerInner ?? m.container
    for (const b of m.bars) {
      if (b.bgAlpha === 0) out.push(f(`sticky bar .${b.cls} has a transparent background`))
      const col = columnOf(b, edge)
      if (Math.abs(b.x - col.x) > 4 || Math.abs(b.r - col.r) > 4) {
        const what = col === edge ? 'the page content' : `its ${b.column} column`
        out.push(f(`sticky bar .${b.cls} (${b.x}-${b.r}) does not line up with ${what} (${col.x}-${col.r})`))
      }
    }
    return out
  },
}
