// B9-44 (TB-03, ruling 7): no half-width orphan tile. Which shown tiles are half tiles on two tracks (40 to 60 rem of Today) and on three
// (from 60 rem, where Advance Steps sits in the aside), so the last one can take the row (two tracks) or To confirm's width (three).
import type { TileId } from '../types'

/** The tiles that take one track; every other tile takes the whole row. */
const HALF: readonly TileId[] = ['advanceSteps', 'leftovers', 'useSoon']
/** From 60 rem these sit in the aside, out of the rows of three. */
const IN_ASIDE: readonly TileId[] = ['advanceSteps']

export interface HalfTiles {
  /** The half tiles on two tracks, in DOM order, and on three tracks (the aside's left out). */
  two: TileId[]
  three: TileId[]
}

export function halfTiles(shown: TileId[]): HalfTiles {
  const two = shown.filter((id) => HALF.includes(id))
  return { two, three: two.filter((id) => !IN_ASIDE.includes(id)) }
}
