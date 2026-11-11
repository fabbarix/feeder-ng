// nextColour mirrors Go's tag.NextColour so the Add sheet can preselect the colour the server would give (spec 4.1).
import { TAG_COLOURS } from './palette'
import type { Tag, TagColourId } from './types'

/** The colour the fewest Tags have; ties go to the first in palette order; ids outside the palette in `counts` are ignored. */
export function nextColour(counts: Readonly<Record<string, number>>): TagColourId {
  let best = TAG_COLOURS[0]!
  let bestCount = counts[best] ?? 0
  for (const id of TAG_COLOURS) {
    const n = counts[id] ?? 0
    if (n < bestCount) {
      best = id
      bestCount = n
    }
  }
  return best
}

/** How many Tags have each colour (any colour string, so unknown ids are counted under their own key). */
export function colourCounts(tags: readonly Pick<Tag, 'colour'>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tags) out[t.colour] = (out[t.colour] ?? 0) + 1
  return out
}
