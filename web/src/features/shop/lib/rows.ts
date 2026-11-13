// DS-SHOP (docs/design/system.md §3): what a Shop row says and what its sheet offers. Plain TypeScript, no React.
import { weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { shopStrings } from '../strings'
import type { PastPlannedMeal } from '../types'
import type { ListEntry } from './lines'

/** Where a row sits: the open list, the Ticked section or the collapsed Not needed group. */
export type RowGroup = 'open' | 'ticked' | 'not-needed'

/** The actions of a row's sheet. The row itself only opens the sheet; the tick stays on the row. */
export type LineAction = 'mark-it' | 'not-needed' | 'needed-after-all' | 'delete'

export interface RowMeta {
  text: string
  /** the tone of the meta line; an info marker for unconfirmed past meals */
  status?: 'info'
}

export interface RowValue {
  value?: string
  subValue?: string
}

/** The short English weekday of a YYYY-MM-DD date ("Tue"). */
export function weekdayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const jsDay = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return weekdayShortName(jsDay === 0 ? 7 : jsDay)
}

/** "A", "A and B", "A, B and C" (the order given is kept). */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${shopStrings.andJoin} ${items[items.length - 1]}`
}

/**
 * The slots of some unconfirmed past meals, in the order given: "Tue Dinner", "Tue Dinner and Wed Lunch", and with
 * `withCourses` a slot with several Courses names them: "Tue Dinner (Main, Side)". '' without meals.
 */
export function slotsLabel(meals: PastPlannedMeal[] | undefined, withCourses = true): string {
  if (!meals || meals.length === 0) return ''
  const slots = new Map<string, { label: string; courses: string[] }>()
  for (const m of meals) {
    const key = `${m.date}|${m.mealSlotId}`
    const slot = slots.get(key) ?? { label: `${weekdayOf(m.date)} ${m.mealSlotName}`, courses: [] }
    if (m.courseName && !slot.courses.includes(m.courseName)) slot.courses.push(m.courseName)
    slots.set(key, slot)
  }
  const named = [...slots.values()].map((s) => (withCourses && s.courses.length > 1 ? shopStrings.unconfirmedCourses(s.label, s.courses.join(', ')) : s.label))
  return joinAnd(named)
}

/**
 * The one meta line: the Restock reason of a Supply Line (info tone), else the pack suggestion, or the info marker that names
 * the slots (never the Courses: it has to fit one line).
 */
export function rowMeta(entry: ListEntry): RowMeta {
  if (entry.restockText) return { text: entry.restockText, status: 'info' }
  if (entry.hintShort) return { text: entry.hintShort, status: 'info' }
  return { text: entry.packLine }
}

/** The value column: the quantity, and the estimated cost under it when there is a Price. Nothing for free text or a ticked Line. */
export function rowValue(entry: ListEntry): RowValue {
  const out: RowValue = {}
  if (entry.quantityText) out.value = entry.quantityText
  if (entry.estimatedCost !== null) out.subValue = entry.estimatedCost
  return out
}

/**
 * What the row's sheet offers, in order. "Mark it" first when the Line has unconfirmed past meals; then Not needed on an
 * open Line, Needed after all on a Not needed one, and Delete on an extra (open or ticked). A ticked Line has nothing else.
 */
export function lineActions(entry: ListEntry, group: RowGroup): LineAction[] {
  const out: LineAction[] = []
  if (entry.markIt) out.push('mark-it')
  if (entry.kind === 'extra') {
    if (group !== 'not-needed') out.push('delete')
  } else if (group === 'open') {
    out.push('not-needed')
  } else if (group === 'not-needed') {
    out.push('needed-after-all')
  }
  return out
}
