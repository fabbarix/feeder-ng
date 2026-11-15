// SAFE-02 (Remove Meal Slot): the words and rows of the confirm and of the toasts. Pure functions, no React. Stub: the developer implements it (B9-42).

/** One Planned Meal of the impact read (`GET /api/meal-slots/{id}/impact`). */
export interface ImpactMeal {
  date: string
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId: number | null
  recipeName: string | null
  pinned: boolean
  bought: string[]
}
export interface ImpactRule {
  id: number
  mealSlotId: number
  mealSlotName: string
  courseId: number
  courseName: string
  recipeId?: number
  recipeName?: string
  tag?: string
}
export interface MealSlotImpact {
  plannedMeals: ImpactMeal[]
  slotRules: ImpactRule[]
  toConfirm: ImpactMeal[]
  cookedKept: number
}
/** The shape ConfirmOptions.groups takes (B9-18). */
export interface RemoveGroup {
  label: string
  rows: { key: string; state?: string; detail?: string }[]
}

export function removeTitle(_slot: { name: string; weekday: number }, _locale = 'en'): string {
  throw new Error('not implemented')
}
export function removeLead(_name: string, _otherDays: number): string | undefined {
  throw new Error('not implemented')
}
export function removedHeadline(_slot: { name: string; weekday: number }, _locale = 'en'): string {
  throw new Error('not implemented')
}
export function restoredHeadline(_slot: { name: string; weekday: number }, _locale = 'en'): string {
  throw new Error('not implemented')
}
export function undoRemoveLabel(_slot: { name: string; weekday: number }, _locale = 'en'): string {
  throw new Error('not implemented')
}
export function removeGroups(_impact: MealSlotImpact, _opts: { today: string; locale?: string }): RemoveGroup[] {
  throw new Error('not implemented')
}
