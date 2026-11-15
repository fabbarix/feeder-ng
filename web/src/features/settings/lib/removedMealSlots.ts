// SET-15: the Removed Meal Slots tile's rows. Pure functions, no React.
import { weekdayShortName } from '../../../ui/WeekdayPicker/weekdays'
import { settingsStrings } from '../strings'
import { todayIso } from './weekdays'

const text = settingsStrings.removed

/** One answer row of `GET /api/meal-slots?removed=with-history`: a name removed on several weekdays at once is one row. */
export interface RemovedMealSlotGroup {
  ids: number[]
  name: string
  /** ISO weekdays 1..7, ascending. */
  weekdays: number[]
  time: string
  /** ISO timestamp of the removal. */
  removedAt: string
  cookedCount: number
  notCookedCount: number
}

export interface RemovedRow {
  /** The ids joined with "-": a stable React key. */
  key: string
  ids: number[]
  name: string
  /** "Snack · Mon to Fri". */
  title: string
  /** "16:30 · removed 14 Nov". */
  detail: string
  /** The row's value, from `historyLabel`. */
  value: string
  /** "Put back Snack · Mon to Fri". */
  putBackLabel: string
}

/** The user's choice (B9-42): the counts read apart, "12 Cooked · 3 Not cooked"; a zero count is left out. */
export function historyLabel(counts: { cookedCount: number; notCookedCount: number }): string {
  const parts: string[] = []
  if (counts.cookedCount > 0) parts.push(text.cooked(counts.cookedCount))
  if (counts.notCookedCount > 0) parts.push(text.notCooked(counts.notCookedCount))
  return parts.join(' · ')
}

/** "Every day"; a run of three or more days "Mon to Fri"; else the short names listed ("Mon, Wed, Fri"). */
export function removedDaysLabel(weekdays: readonly number[], locale = 'en'): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b)
  if (days.length === 7) return settingsStrings.slot.everyDay
  const run = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1)
  if (run) return text.range(weekdayShortName(days[0]!, locale), weekdayShortName(days[days.length - 1]!, locale))
  return days.map((d) => weekdayShortName(d, locale)).join(', ')
}

/** "14 Nov": the local date of a removal. */
function removedOn(at: string, locale: string): string {
  const when = new Date(at)
  if (Number.isNaN(when.getTime())) return ''
  let month: string
  try {
    month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(when)
  } catch {
    month = new Intl.DateTimeFormat('en', { month: 'short' }).format(when)
  }
  return `${Number(todayIso(when).slice(8, 10))} ${month}`
}

/** The tile's rows, newest removal first. */
export function removedMealSlotRows(groups: readonly RemovedMealSlotGroup[], locale = 'en'): RemovedRow[] {
  return [...groups]
    .sort((a, b) => b.removedAt.localeCompare(a.removedAt))
    .map((g) => {
      const title = text.rowTitle(g.name, removedDaysLabel(g.weekdays, locale))
      return {
        key: g.ids.join('-'),
        ids: [...g.ids],
        name: g.name,
        title,
        detail: text.detail(g.time, removedOn(g.removedAt, locale)),
        value: historyLabel(g),
        putBackLabel: text.putBack(title),
      }
    })
}
