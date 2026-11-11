// nextColour mirrors Go's tag.NextColour so the Add sheet can preselect the colour the server would give (spec 4.1).
import type { Tag, TagColourId } from './types'

/** The colour the fewest Tags have; ties go to the first in palette order; ids outside the palette in `counts` are ignored. */
export function nextColour(counts: Readonly<Record<string, number>>): TagColourId {
  void counts
  throw new Error('TG-UI: not implemented')
}

/** How many Tags have each colour (any colour string, so unknown ids are counted under their own key). */
export function colourCounts(tags: readonly Pick<Tag, 'colour'>[]): Record<string, number> {
  void tags
  throw new Error('TG-UI: not implemented')
}
