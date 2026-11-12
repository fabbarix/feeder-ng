// CRS G2 (RX, docs/dev/design/crs-g2.md section 3): the Review Exclusions page. Plain TypeScript, no React.
import { planStrings as s } from '../strings'
import type { ExclusionCell, ExclusionRecord, MemberRef, PlanEntry, PlanSlot } from '../types'
import { causeOf, cellItems, courseCells, groupByCause, type CauseItem } from './couldntGroups'
import { summarizeCells } from './couldntSummary'

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

/** The first name, as the Member pills show it. */
const firstName = (m: MemberRef): string => m.name.split(' ')[0] ?? m.name

/** "A", "A and B", "A, B and C". */
function joinAnd(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return s.summaryAnd(names.slice(0, -1).join(', '), names[names.length - 1]!)
}

/** The API's cells as flat Couldn't plan entries (reason `no_candidates`, name = the Meal Slot name), for the grouping code of the tile. */
export function cellsAsEntries(cells: ExclusionCell[]): PlanEntry[] {
  return cells.map((c) => ({
    date: c.date,
    mealSlotId: c.mealSlotId,
    name: c.mealSlotName,
    time: c.time,
    at: `${c.date}T${c.time}:00`,
    portions: 0,
    meal: null,
    unfilled: { reason: 'no_candidates', slotRuleClaimed: c.slotRuleClaimed, eliminated: c.eliminated },
    rules: [],
    courseId: c.courseId,
    courseName: c.courseName,
  }))
}

/** The cells the SPA files under Excluded (`causeOf(...) === 'excluded'`): a Slot Rule cell and one where an Advance Step removed more are not. */
export function excludedCells(cells: ExclusionCell[]): ExclusionCell[] {
  return cells.filter((c) => causeOf(cellsAsEntries([c])[0]!) === 'excluded')
}

/** The headline of the page's summary Tile, the Excluded tile's: "Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it." null when no cell is held back by Exclusions. */
export function excludedSummary(cells: ExclusionCell[], slots: PlanSlot[]): string | null {
  const held = excludedCells(cells)
  if (held.length === 0) return null
  const group = groupByCause(cellsAsEntries(held), courseCells(slots)).find((g) => g.cause === 'excluded')
  return group ? group.headline : null
}

/** A stable signature of an explanation: the Course, the Exclusions, "and N more", and the Members who eat it and who opt out. */
function signature(c: ExclusionCell): string {
  const exclusions = c.exclusions === null ? 'none' : JSON.stringify(c.exclusions.map((r) => [r.member.id, r.ingredient?.id ?? 0, r.recipes.map((x) => x.id), r.recipeCount]))
  return [c.courseId, exclusions, c.moreExclusions, c.attendance.map((m) => m.id).join(','), c.optOuts.map((m) => m.id).join(',')].join('|')
}

/** One group per explanation, in the order of each group's first cell. Only `excludedCells`. */
export function explanationGroups(cells: ExclusionCell[], slots: PlanSlot[]): ExplanationGroup[] {
  const byKey = new Map<string, ExclusionCell[]>()
  for (const c of excludedCells(cells)) {
    const key = signature(c)
    byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  return [...byKey.entries()].map(([key, group]) => {
    const first = group[0]!
    const entries = cellsAsEntries(group)
    return {
      key,
      courseId: first.courseId,
      courseName: first.courseName,
      cells: group,
      summary: summarizeCells(entries, courseCells(slots)),
      items: cellItems(entries, courseCells(slots)),
      attendance: first.attendance,
      optOuts: first.optOuts,
      exclusions: first.exclusions,
      moreExclusions: first.moreExclusions,
    }
  })
}

/** The Recipes of a record: at most three names, then "and N more" (N from `recipeCount`, which can exceed the five sent). */
function recipeParts(record: ExclusionRecord, link: ((id: number) => string) | undefined): RecordPart[] {
  const shown = record.recipes.slice(0, 3)
  const more = record.recipeCount - shown.length
  const parts: RecordPart[] = []
  shown.forEach((r, i) => {
    if (i > 0) parts.push({ text: i === shown.length - 1 && more <= 0 ? ' and ' : ', ' })
    parts.push({ text: r.name, to: link?.(r.id) })
  })
  if (more > 0) parts.push({ text: ` ${s.couldntExclusions.andMore(more)}` })
  return parts
}

const plainText = (parts: RecordPart[]): string => parts.map((p) => p.text).join('')

/** The first line of an Exclusion row, in pieces: "Sam excludes garlic", "Alex excludes Fish pie", "Alex excludes 3 Recipes: Fish pie, Lasagne and Paella". */
export function recordText(record: ExclusionRecord): RecordPart[] {
  const who: RecordPart = { text: firstName(record.member), strong: true }
  if (record.ingredient) {
    return [who, { text: ` ${s.couldntExclusions.excludes} ` }, { text: record.ingredient.name, strong: true }]
  }
  const link = (id: number) => `/recipes/${id}#preference-member-${record.member.id}`
  const count = record.recipeCount === 1 ? '' : `${record.recipeCount} Recipes: `
  return [who, { text: ` ${s.couldntExclusions.excludes} ${count}` }, ...recipeParts(record, link)]
}

/** The second line: "Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more" for an Ingredient; null for a direct Exclusion. */
export function recordDetail(record: ExclusionRecord): string | null {
  if (!record.ingredient) return null
  return s.couldntExclusions.ruleOut(record.recipeCount, plainText(recipeParts(record, undefined)))
}

/** The trailing link of the row: "Review garlic" to `/ingredients/<id>#exclusions` for an Ingredient; null for a direct Exclusion (its Recipes are links in the first line). */
export function recordAction(record: ExclusionRecord): { label: string; to: string } | null {
  if (!record.ingredient) return null
  return { label: s.couldntExclusions.reviewIngredient(record.ingredient.name), to: `/ingredients/${record.ingredient.id}#exclusions` }
}

/** "Kim opts out of Side, so Kim's Exclusions don't count here." null when nobody opts out. */
export function optOutLine(cell: Pick<ExclusionCell, 'optOuts' | 'courseName'>): string | null {
  if (cell.optOuts.length === 0) return null
  const course = cell.courseName || s.couldntExclusions.thisCourse
  if (cell.optOuts.length === 1) return s.couldntExclusions.optOutOne(firstName(cell.optOuts[0]!), course)
  return s.couldntExclusions.optOutMany(joinAnd(cell.optOuts.map(firstName)), course)
}
