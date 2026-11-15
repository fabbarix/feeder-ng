// B9-44 (TB-03, ruling 7): no half-width orphan tile. Which shown tiles are half tiles on two tracks (40 to 60 rem of Today) and on three
// (from 60 rem, where Advance Steps sits in the aside), so the last one can take the row (two tracks) or To confirm's width (three).
// B9-53 (TB-06): the compact setup checklist is a half tile too. It follows the hero, so on two tracks a To confirm after it (a full row)
// leaves it alone in its row: it then takes the row itself (`alone2`) and the other half tiles pair up on their own.
import type { TileId } from '../types'

/** The tiles that take one track; every other tile takes the whole row. */
const HALF: readonly TileId[] = ['advanceSteps', 'couldntPlan', 'spoiled', 'leftovers', 'useSoon']
/** From 60 rem these sit in the aside, out of the rows of three. */
const IN_ASIDE: readonly TileId[] = ['advanceSteps']

export interface HalfTiles {
  /** The half tiles on two tracks, in DOM order, and on three tracks (the aside's left out). */
  two: TileId[]
  three: TileId[]
  /** B9-53: half tiles alone in their row on two tracks (a full-row tile follows them): they take the row. */
  alone2: TileId[]
}

export function halfTiles(shown: TileId[], options: { setupCompact?: boolean } = {}): HalfTiles {
  const isHalf = (id: TileId) => HALF.includes(id) || (id === 'setup' && options.setupCompact === true)
  const halves = shown.filter(isHalf)
  const alone2 = options.setupCompact === true && shown.includes('setup') && shown.includes('toConfirm') ? (['setup'] as TileId[]) : []
  return { two: halves.filter((id) => !alone2.includes(id)), three: halves.filter((id) => !IN_ASIDE.includes(id)), alone2 }
}

/**
 * The three-track areas (ADR 0026): `head` says which of the hero and To confirm are drawn ('hc', 'h', 'c' or 'none'), `lead` how many full rows
 * come before them (the Shopping tile, then the full setup checklist; the compact one follows the hero as a half tile).
 */
export function topAreas(ids: readonly TileId[], setupCompact: boolean): { head: 'hc' | 'h' | 'c' | 'none'; lead: '0' | '1' | '2' } {
  const hero = ids.includes('nextMeal')
  const confirm = ids.includes('toConfirm')
  const head = hero && confirm ? 'hc' : hero ? 'h' : confirm ? 'c' : 'none'
  const lead = Number(ids.includes('shopping')) + Number(ids.includes('setup') && !setupCompact)
  return { head, lead: String(lead) as '0' | '1' | '2' }
}
