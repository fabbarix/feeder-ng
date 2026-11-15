// DS-SHOP (docs/design/system.md §3, §9): the unconfirmed past meals are said ONCE for the whole list, above it. B9-43 (SSP-04): the
// predicate comes first, as a title ("Not marked Cooked yet"), then a count chip and the slots as a plain meta line. No React.
import { shopStrings } from '../strings'
import type { PastPlannedMeal, ShoppingList } from '../types'
import { markItTarget } from './lines'
import { weekdayOf, joinAnd } from './rows'

/** A piece of the notice's slots line; plain text (B9-43: nothing in the notice is set bold). */
export interface NoticeSegment {
  text: string
  strong?: boolean
}

export interface UnconfirmedNotice {
  /** B9-43 (SSP-04): the predicate first: "Not marked Cooked yet" */
  title: string
  /** B9-43: the slots, plain segments (none `strong`): "Sat Breakfast, Sat Lunch and Sat Dinner", "… and 2 more" */
  slots: NoticeSegment[]
  /** the Meal Slots to mark (one per day and slot), the count chip */
  count: number
  /** "Mark it" opens the oldest of those slots on the Plan */
  markIt: { date: string; mealSlotId: number }
}

/** At most this many slot groups are named; the rest is "and N more", so the slots line stays on two lines. */
const MAX_GROUPS = 3

/**
 * The notice for the open Lines (ticked and Not needed Lines do not count). Days of one Meal Slot are merged into one
 * group ("Tue and Wed Dinner"); Courses are not listed; the groups are oldest first. null when there is nothing to say.
 */
export function unconfirmedNotice(list: ShoppingList): UnconfirmedNotice | null {
  const open = list.lines.filter((line) => !line.ticked && (line.pastPlannedMeals?.length ?? 0) > 0)
  if (open.length === 0) return null
  const meals: PastPlannedMeal[] = open.flatMap((line) => line.pastPlannedMeals ?? [])
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

  const slots: NoticeSegment[] = []
  shown.forEach((label, i) => {
    if (i > 0) slots.push({ text: i === shown.length - 1 && more === 0 ? ` ${shopStrings.andJoin} ` : ', ' })
    slots.push({ text: label })
  })
  if (more > 0) slots.push({ text: ` ${shopStrings.andMore(more)}` })
  const count = new Set(meals.map((m) => `${m.date}|${m.mealSlotId}`)).size
  return { title: shopStrings.notMarkedTitle, slots, count, markIt }
}
