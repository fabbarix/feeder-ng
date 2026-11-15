// B9-45 (PC-02): the words of the Cooked confirmation. Plain TypeScript, no React.
import { cookedAllOutcomes, cookedAllRecipe, leftoverOutcome, type LeftoverOutcome } from '../../plan/lib/cook'
import { weekdayName } from '../../plan/lib/phrase'
import type { CookedAllResult, CookedResult, SlotDayKey, SlotKey } from '../../plan/types'

/** "Mon Dinner", or "Mon Dinner, Side" when one Course of several was cooked (`courseName` given). `date` is YYYY-MM-DD. */
export function cookedMealLabel(date: string, slotName: string, courseName?: string | null): string {
  const label = `${weekdayName(date, 'short')} ${slotName}`
  return courseName ? `${label}, ${courseName}` : label
}

/** The line under "Cooked, nice one!": "Cauliflower al gorgonzola · Sat Dinner"; without a Recipe name (several Courses cooked together) the meal alone. */
export function cookedLine(recipeName: string | null, mealLabel: string): string {
  return recipeName ? `${recipeName} · ${mealLabel}` : mealLabel
}

/** The Undo button's accessible name: "Undo Cooked for Sat Dinner"; for a Mark all Cooked of several Courses "Undo Cooked for all 3 Courses". */
export function undoCookedName(mealLabel: string, courses?: number): string {
  return courses !== undefined && courses > 1 ? `Undo Cooked for all ${courses} Courses` : `Undo Cooked for ${mealLabel}`
}

/** One Leftover tile of the confirmation; `recipeName` names it when a Mark all Cooked kept several. */
export interface CookedLeftover {
  outcome: LeftoverOutcome
  recipeName?: string
}

/** What the confirmation shows after the last thing cooked on the screen, and the Course its Undo reopens. */
export interface CookedMoment {
  /** The Course the Undo posts to (the first Course of a Mark all: the server takes back the whole Mark all). */
  undoKey: SlotKey
  recipeName: string | null
  mealLabel: string
  undoLabel: string
  leftovers: CookedLeftover[]
}

/** One Course marked Cooked. `courseName` is given when the slot has several Courses ("Mon Dinner, Side"). */
export function courseCookedMoment(key: SlotKey, slotName: string, result: CookedResult, recipeName: string, courseName?: string | null): CookedMoment {
  const mealLabel = cookedMealLabel(key.date, slotName, courseName)
  const outcome = leftoverOutcome(result)
  return {
    undoKey: key,
    recipeName: recipeName || result.meal.recipeName || null,
    mealLabel,
    undoLabel: undoCookedName(mealLabel),
    leftovers: outcome.kind === 'none' ? [] : [{ outcome }],
  }
}

/** A Mark all Cooked of `courseIds` (in order): one Undo for all of it, through the first Course. */
export function allCookedMoment(slot: SlotDayKey, slotName: string, courseIds: number[], result: CookedAllResult): CookedMoment {
  const mealLabel = cookedMealLabel(slot.date, slotName)
  const outcomes = cookedAllOutcomes(result)
  const several = outcomes.length > 1
  return {
    undoKey: { date: slot.date, mealSlotId: slot.mealSlotId, courseId: courseIds[0] ?? 0 },
    recipeName: cookedAllRecipe(result),
    mealLabel,
    undoLabel: undoCookedName(mealLabel, courseIds.length),
    leftovers: outcomes.map((outcome, i) => (several ? { outcome, recipeName: result.leftovers[i]?.recipeName } : { outcome })),
  }
}
