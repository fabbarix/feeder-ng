// B9-45 (PC-02): the words of the Cooked confirmation. Plain TypeScript, no React.
import { weekdayName } from '../../plan/lib/phrase'

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
