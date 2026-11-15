// B9-38 (PC-10, user decision): the words of a pick from "Other Recipes" in Choose a Recipe, which marks the Recipe with the
// Course and sets it in one write. Plain TypeScript, no React.
import type { Leftover } from '../../../lib/leftovers/types'
import { planStrings as s } from '../strings'
import { undoStrings as u } from '../strings/undo'
import type { PlanSlot, SlotKey } from '../types'
import { courseOf } from './courses'
import { weekdayName } from './phrase'
import type { ReplanToast } from './replan'

/**
 * "Baked apples chosen for Tue Dinner and marked as Dessert", subline "It stays marked as Dessert." (its Undo restores the plan,
 * not the mark). The rest (What changed's body, Review, the Undo's name) is the ordinary Choose toast's, `base`.
 */
export function markedChoiceWords(base: ReplanToast | null, src: { recipeName: string; courseName?: string; key: SlotKey; slots: PlanSlot[] }): ReplanToast {
  const slot = src.slots.find((x) => x.date === src.key.date && x.mealSlotId === src.key.mealSlotId)
  const course = src.courseName ?? (slot ? courseOf(slot, src.key.courseId)?.name : undefined) ?? ''
  const label = slot ? u.slotLabel(weekdayName(src.key.date, 'short'), slot.name) : weekdayName(src.key.date, 'short')
  const rest = base ?? { headline: '', review: false, undoAriaLabel: u.undoEdit(u.editNoun.choose) }
  return { ...rest, headline: s.chosenAndMarked(src.recipeName, label, course), subline: s.staysMarked(course) }
}

/** B9-38 (PC-09): the Leftover a Cooked meal made (its fromDate, fromMealSlotId and fromCourseId); null when none is left. */
export function mealLeftover(leftovers: Leftover[], key: SlotKey | null): Leftover | null {
  if (!key) return null
  return leftovers.find((l) => l.fromDate === key.date && l.fromMealSlotId === key.mealSlotId && (l.fromCourseId === undefined || l.fromCourseId === key.courseId)) ?? null
}
