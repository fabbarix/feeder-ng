// B9-44 (RES-09): Today's tile registry: each tile's title (for "<Tile> couldn’t be shown.") and the queries its Try again resets.
import { todayStrings as s } from '../strings'
import type { TileId } from '../types'

const TITLES: Record<TileId, string> = {
  nextMeal: s.tiles.nextMeal,
  toConfirm: s.tiles.toConfirm,
  advanceSteps: s.advanceStepsHeading,
  metrics: s.metricsLabel,
  couldntPlan: s.tiles.couldntPlan,
  spoiled: s.tiles.spoiled,
  leftovers: s.tiles.leftovers,
  useSoon: s.useSoonHeading,
  setup: s.setupTitle,
  shopping: s.tiles.shopping,
}

const KEYS: Record<TileId, unknown[][]> = {
  nextMeal: [['plan', 'view']],
  toConfirm: [['plan', 'to-confirm'], ['plan', 'view']],
  advanceSteps: [['today', 'advance-steps']],
  metrics: [['today', 'streak']],
  couldntPlan: [['plan', 'couldnt-plan']],
  spoiled: [['stock', 'spoiled']],
  leftovers: [['plan', 'leftovers']],
  useSoon: [['stock', 'totals'], ['stock', 'lots', 'all']],
  setup: [],
  shopping: [],
}

export function tileTitle(id: TileId): string {
  return TITLES[id]
}

export function tileQueryKeys(id: TileId): unknown[][] {
  return KEYS[id]
}
