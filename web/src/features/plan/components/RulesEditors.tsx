import type { ReactNode } from 'react'
import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'

export interface SlotRulesEditorProps {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  onAdd: (body: { mealSlotId: number; recipeId?: number; tag?: string }) => void
  onRemove: (id: number) => void
  error: string | null
}

/** Lists the Slot Rules ("Friday Dinner: Tag: pizza") with Remove, and a form to add one (Meal Slot, then a Recipe or a Tag). */
export function SlotRulesEditor(props: SlotRulesEditorProps): ReactNode {
  void props
  return null
}

export interface VarietyRulesEditorProps {
  rules: VarietyRule[]
  onSave: (rule: VarietyRule) => void
  onRemove: (tag: string) => void
  error: string | null
}

/** Lists the Variety Rules with Remove, and a form (Tag, weekly limit, never on consecutive days). */
export function VarietyRulesEditor(props: VarietyRulesEditorProps): ReactNode {
  void props
  return null
}
