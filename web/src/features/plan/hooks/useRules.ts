import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'

export interface UseSlotRules {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  add: (body: { mealSlotId: number; recipeId?: number; tag?: string }) => Promise<boolean>
  remove: (id: number) => Promise<void>
  error: string | null
  isLoading: boolean
}

/** Slot Rules plus the Meal Slots and Recipes the form chooses from. Invalidates ['plan'] on every change. */
export function useSlotRules(): UseSlotRules {
  return { rules: [], mealSlots: [], recipes: [], add: async () => false, remove: async () => {}, error: null, isLoading: false }
}

export interface UseVarietyRules {
  rules: VarietyRule[]
  save: (rule: VarietyRule) => Promise<boolean>
  remove: (tag: string) => Promise<void>
  error: string | null
  isLoading: boolean
}

export function useVarietyRules(): UseVarietyRules {
  return { rules: [], save: async () => false, remove: async () => {}, error: null, isLoading: false }
}
