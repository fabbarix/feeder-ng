// B9-44 (RES-05): Today remembers the tile ids and row counts of the last layout it showed (localStorage `feeder.today.layout`) and
// draws that shape as its skeleton while the plan is on its way, so nothing is inserted above a painted tile. Plain TypeScript.
import type { TileId, TodayLayout } from '../types'

export const LAYOUT_KEY = 'feeder.today.layout'
/** A skeleton is a shape, not a copy: at most this many rows per tile. */
export const MAX_ROWS = 4

export interface RememberedTile {
  id: TileId
  rows?: number
}
export interface RememberedLayout {
  tiles: RememberedTile[]
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const IDS: readonly TileId[] = ['nextMeal', 'spoiled', 'advanceSteps', 'toConfirm', 'couldntPlan', 'setup', 'leftovers', 'useSoon', 'metrics', 'shopping']
const FIRST_LAUNCH: RememberedLayout = { tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 1 }] }

function store(given?: Storage): Storage | null {
  if (given) return given
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Stores the layout's tiles (not the transient Shopping tile) with their row counts; a failed, empty or tileless Today is not stored. */
export function rememberLayout(layout: TodayLayout, rows: Partial<Record<TileId, number>>, storage?: Storage): void {
  if (layout.mode !== 'today' || layout.failed || layout.empty) return
  const tiles: RememberedTile[] = layout.tiles
    .filter((t) => t.id !== 'shopping')
    .map((t) => {
      const n = rows[t.id]
      return n !== undefined && n > 0 ? { id: t.id, rows: Math.min(MAX_ROWS, Math.floor(n)) } : { id: t.id }
    })
  if (tiles.length === 0) return
  try {
    store(storage)?.setItem(LAYOUT_KEY, JSON.stringify({ tiles }))
  } catch {
    // a private window or full storage: the next load shows the first-launch shape
  }
}

/** The remembered layout, or the first-launch shape (the hero and one To confirm row) when there is none or it is not a layout. */
export function recallLayout(storage?: Storage): RememberedLayout {
  try {
    const raw = store(storage)?.getItem(LAYOUT_KEY)
    if (!raw) return FIRST_LAUNCH
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as RememberedLayout).tiles)) return FIRST_LAUNCH
    const tiles = (parsed as { tiles: unknown[] }).tiles
    const out: RememberedTile[] = []
    for (const t of tiles) {
      if (!t || typeof t !== 'object') return FIRST_LAUNCH
      const { id, rows } = t as { id?: unknown; rows?: unknown }
      if (typeof id !== 'string' || !IDS.includes(id as TileId) || id === 'shopping') return FIRST_LAUNCH
      out.push(typeof rows === 'number' && rows > 0 ? { id: id as TileId, rows: Math.min(MAX_ROWS, Math.floor(rows)) } : { id: id as TileId })
    }
    return out.length > 0 ? { tiles: out } : FIRST_LAUNCH
  } catch {
    return FIRST_LAUNCH
  }
}

export interface RowSources {
  /** To confirm's entries (one per Course): a row per Meal Slot and day. */
  toConfirm: { date: string; mealSlotId: number }[]
  advanceSteps: number
  leftovers: number
  useSoon: number
  spoiled: number
}

/** The rows each tile shows, for the remembered shape (Use soon and Throw out or keep? show at most three, Advance Steps four). */
export function rowCounts(r: RowSources): Partial<Record<TileId, number>> {
  const slots = new Set(r.toConfirm.map((e) => `${e.date}:${e.mealSlotId}`)).size
  return { toConfirm: slots, advanceSteps: Math.min(r.advanceSteps, 4), leftovers: r.leftovers, useSoon: Math.min(r.useSoon, 3), spoiled: Math.min(r.spoiled, 3) }
}
