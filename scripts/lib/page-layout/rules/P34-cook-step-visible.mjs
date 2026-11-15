// P34 (always fails; B9-40, SHORT-01): the Cook Step text is not visible outside the Back/Next tiles at load. The metrics come from
// probes/cook-step.mjs on the cook-step-landscape and cook-step-portrait scenarios:
//   cookStep: null | { innerWidth, innerHeight, text: Box | null, tiles: Box[] }   Box = { x, y, r, b } in px
// `text` is the FIRST LINE of .cook-step__text (its first client rect). At least 80 % of that line's area must be inside the viewport
// and outside every Back/Next tile (overlapping tiles count once; the gap of up to 24 px between two tiles of one row is the nav band's). One finding per page; no metrics or no text box: nothing to judge.
// Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-40.test.ts).
const f = (text) => ({ rule: 'P34', message: `P34 ${text}` })
/** The share of the first line that must be visible. */
const MIN_VISIBLE = 0.8
/** Two tiles on the same row this close are one nav band: the gap between them is the sticky nav's opaque background. */
const BAND_GAP = 24

const clip = (a, b) => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) })
const area = (a) => Math.max(0, a.r - a.x) * Math.max(0, a.b - a.y)

/** The area of the union of `rects` (each already clipped to the region judged), by compressing their edges into a grid. */
function unionArea(rects) {
  const live = rects.filter((r) => area(r) > 0)
  if (live.length === 0) return 0
  const xs = [...new Set(live.flatMap((r) => [r.x, r.r]))].sort((a, b) => a - b)
  const ys = [...new Set(live.flatMap((r) => [r.y, r.b]))].sort((a, b) => a - b)
  let total = 0
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      const cy = (ys[j] + ys[j + 1]) / 2
      if (live.some((r) => cx > r.x && cx < r.r && cy > r.y && cy < r.b)) total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j])
    }
  }
  return total
}

/** The tiles, plus the gap between two tiles of the same row that are at most BAND_GAP apart (the nav band covers it too). */
function bandRects(tiles) {
  const out = [...tiles]
  for (const a of tiles) {
    for (const b of tiles) {
      if (a === b || b.x < a.r) continue
      const gap = b.x - a.r
      const top = Math.max(a.y, b.y)
      const bottom = Math.min(a.b, b.b)
      if (gap > 0 && gap <= BAND_GAP && bottom > top) out.push({ x: a.r, y: top, r: b.x, b: bottom })
    }
  }
  return out
}

export default {
  id: 'P34',
  title: 'The Cook Step text is not visible outside the Back/Next tiles at load (SHORT-01)',
  always: true,
  evaluate(m, _ctx) {
    const cs = m.cookStep
    if (!cs || !cs.text) return []
    const line = cs.text
    const whole = area(line)
    if (whole <= 0) return []
    const viewport = { x: 0, y: 0, r: cs.innerWidth, b: cs.innerHeight }
    const inView = clip(line, viewport)
    const covered = unionArea(bandRects(cs.tiles ?? []).map((t) => clip(t, inView)))
    const visible = Math.max(0, area(inView) - covered) / whole
    if (visible >= MIN_VISIBLE - 1e-9) return []
    const pct = Math.floor(visible * 100 + 1e-9)
    return [
      f(
        `at ${cs.innerWidth}x${cs.innerHeight} only ${pct} % of the first line of the Step text is visible outside the Back/Next tiles ` +
          `(line at y ${Math.round(line.y)}-${Math.round(line.b)}); the Step must show without scrolling (SHORT-01: side columns in short landscape, a capped photo)`,
      ),
    ]
  },
}
