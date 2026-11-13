// DS-SHOP (docs/design/system.md §3, §9): "Tue Dinner isn't marked Cooked yet" is said ONCE for the whole list, above it.
// Plain TypeScript, no React. The slots are segments so the view can set them in bold; the text is their join.
import { shopStrings } from '../strings'
import type { PastPlannedMeal, ShoppingList } from '../types'
import { markItTarget } from './lines'
import { weekdayOf, joinAnd } from './rows'

/** A piece of the notice; a slot ("Tue Dinner") is `strong`. */
export interface NoticeSegment {
  text: string
  strong?: boolean
}

export interface UnconfirmedNotice {
  /** "Tue and Wed Dinner aren't marked Cooked yet" */
  text: string
  segments: NoticeSegment[]
  /** how many open Lines include unconfirmed past meals */
  count: number
  /** "Mark it" opens the oldest of those slots on the Plan */
  markIt: { date: string; mealSlotId: number }
}

/** At most this many slot groups are named; the rest is "and N more", so the notice stays on two lines. */
const MAX_GROUPS = 3

/**
 * The notice for the open Lines (ticked and Not needed Lines do not count). Days of one Meal Slot are merged into one
 * group ("Tue and Wed Dinner"); Courses are not listed; the groups are oldest first. null when there is nothing to say.
 */
export function unconfirmedNotice(list: ShoppingList): UnconfirmedNotice | null {
  const open = list.lines.filter((line) => !line.ticked && (line.pastPlannedMeals?.length ?? 0) > 0)
  if (open.length === 0) return null
  const seen = new Set<string>()
  const meals: PastPlannedMeal[] = []
  for (const line of open) {
    for (const meal of line.pastPlannedMeals ?? []) {
      const key = `${meal.date}|${meal.mealSlotId}|${meal.courseName}`
      if (seen.has(key)) continue
      seen.add(key)
      meals.push(meal)
    }
  }
  meals.sort((a, b) => a.date.localeCompare(b.date) || a.mealSlotId - b.mealSlotId)
  const markIt = markItTarget(meals)
  if (!markIt) return null

  // one group per Meal Slot name, in the order its first day appears; the days of a group are unique
  const groups = new Map<string, string[]>()
  for (const meal of meals) {
    const days = groups.get(meal.mealSlotName) ?? []
    const day = weekdayOf(meal.date)
    if (!days.includes(day)) days.push(day)
    groups.set(meal.mealSlotName, days)
  }
  const labels = [...groups].map(([name, days]) => `${joinAnd(days)} ${name}`)
  const shown = labels.slice(0, MAX_GROUPS)
  const more = labels.length - shown.length

  const segments: NoticeSegment[] = []
  shown.forEach((label, i) => {
    if (i > 0) segments.push({ text: i === shown.length - 1 && more === 0 ? ` ${shopStrings.andJoin} ` : ', ' })
    segments.push({ text: label, strong: true })
  })
  const distinctSlots = new Set(meals.map((m) => `${m.date}|${m.mealSlotId}`)).size
  segments.push({ text: `${more > 0 ? shopStrings.andMore(more) : ''}${distinctSlots > 1 ? shopStrings.arent : shopStrings.isnt}` })

  return { text: segments.map((s) => s.text).join(''), segments, count: open.length, markIt }
}
