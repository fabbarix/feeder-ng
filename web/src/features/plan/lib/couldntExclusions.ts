// CRS G2 (RX, docs/dev/design/crs-g2.md section 3): the Review Exclusions page. Plain TypeScript, no React.
import type { CauseItem } from './couldntGroups'
import type { ExclusionCell, ExclusionRecord, MemberRef, PlanSlot } from '../types'

/** A piece of the first line of an Exclusion row; `strong` is the Member and the thing excluded, `to` makes it a link. */
export interface RecordPart {
  text: string
  strong?: boolean
  to?: string
}

/** Cells that share one explanation: the same Course, Exclusions, Members who eat it and Members who opt out. */
export interface ExplanationGroup {
  /** Stable for the same explanation: the Course and a signature of the rest. */
  key: string
  courseId: number
  courseName: string
  /** In plan order. */
  cells: ExclusionCell[]
  /** "Side at every dinner this week" (lib/couldntSummary summarizeCells over the group's cells). */
  summary: string
  /** One line per cell, "Fri 13 Nov · Dinner · Side", each with the id of its `<li>`. No `to`. */
  items: CauseItem[]
  attendance: MemberRef[]
  optOuts: MemberRef[]
  exclusions: ExclusionRecord[] | null
  moreExclusions: number
}

/** The API's cells as flat Couldn't plan entries (reason `no_candidates`, name = the Meal Slot name), for the grouping code of the tile. */
export function cellsAsEntries(_cells: ExclusionCell[]): PlanSlot[] {
  throw new Error('CRS G2: not implemented')
}

/** The cells the SPA files under Excluded (`causeOf(...) === 'excluded'`): a Slot Rule cell and one where an Advance Step removed more are not. */
export function excludedCells(_cells: ExclusionCell[]): ExclusionCell[] {
  throw new Error('CRS G2: not implemented')
}

/** The headline of the page's summary Tile, the Excluded tile's: "Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it." null when no cell is held back by Exclusions. */
export function excludedSummary(_cells: ExclusionCell[], _slots: PlanSlot[]): string | null {
  throw new Error('CRS G2: not implemented')
}

/** One group per explanation, in the order of each group's first cell. Only `excludedCells`. */
export function explanationGroups(_cells: ExclusionCell[], _slots: PlanSlot[]): ExplanationGroup[] {
  throw new Error('CRS G2: not implemented')
}

/** The first line of an Exclusion row, in pieces: "Sam excludes garlic", "Alex excludes Fish pie", "Alex excludes 3 Recipes: Fish pie, Lasagne and Paella". */
export function recordText(_record: ExclusionRecord): RecordPart[] {
  throw new Error('CRS G2: not implemented')
}

/** The second line: "Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more" for an Ingredient; null for a direct Exclusion. */
export function recordDetail(_record: ExclusionRecord): string | null {
  throw new Error('CRS G2: not implemented')
}

/** The trailing link of the row: "Review garlic" to `/ingredients/<id>#exclusions` for an Ingredient; null for a direct Exclusion (its Recipes are links in the first line). */
export function recordAction(_record: ExclusionRecord): { label: string; to: string } | null {
  throw new Error('CRS G2: not implemented')
}

/** "Kim opts out of Side, so Kim's Exclusions don't count here." null when nobody opts out. */
export function optOutLine(_cell: Pick<ExclusionCell, 'optOuts' | 'courseName'>): string | null {
  throw new Error('CRS G2: not implemented')
}
