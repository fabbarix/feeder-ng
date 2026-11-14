// P6 (warn or fail by the route mode): A sticky action bar has a background and lines up with the page content.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P6', message: `P6 ${text}` })

export default {
  id: 'P6',
  title: 'A sticky action bar has a background and lines up with the page content',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // The bar floats inside the gutters, so it lines up with the container's content box (containerInner) when the probe reports it.
    const edge = m.containerInner ?? m.container
    for (const b of m.bars) {
      if (b.bgAlpha === 0) out.push(f(`sticky bar .${b.cls} has a transparent background`))
      if (Math.abs(b.x - edge.x) > 4 || Math.abs(b.r - edge.r) > 4) {
        out.push(f(`sticky bar .${b.cls} (${b.x}-${b.r}) does not line up with the page content (${edge.x}-${edge.r})`))
      }
    }
    return out
  },
}
