// B9-51 (SAFE-04, SAFE-02): the rule forms' errors by field, and how a rule is named for its Remove button, its removal toast and its
// Undo. Plain TypeScript, no React.
import type { Tag } from '../../../lib/tags'
import { planStrings as s } from '../strings'
import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'
import { ruleRemovalStrings as r } from './planningRulesStrings'
import { mealSlotLabel, normaliseTag, ruleCourseName, slotRuleTitle, type SlotRuleDraft, type VarietyDraft } from './rules'
import { tagPill } from './tagPill'

export interface SlotRuleFieldErrors {
  mealSlotId?: string
  recipeId?: string
  tag?: string
}

/** Every field the Slot Rule form is missing, each with its own message (SAFE-04): the Meal Slot, then the Recipe or the Tag. */
export function slotRuleFieldErrors(draft: SlotRuleDraft): SlotRuleFieldErrors {
  const errors: SlotRuleFieldErrors = {}
  if (!draft.mealSlotId) errors.mealSlotId = s.errorMealSlotRequired
  if (draft.kind === 'tag' && !draft.tag.trim()) errors.tag = s.errorSlotTagRequired
  if (draft.kind === 'recipe' && !draft.recipeId) errors.recipeId = s.errorSlotRecipeRequired
  return errors
}

export interface VarietyRuleFieldErrors {
  tag?: string
  maxPerWeek?: string
}

/** Every field the Variety Rule form has wrong (SAFE-04): no Tag; no limit at all, or a weekly limit outside 1 to 21. */
export function varietyRuleFieldErrors(draft: VarietyDraft): VarietyRuleFieldErrors {
  const errors: VarietyRuleFieldErrors = {}
  if (!normaliseTag(draft.tag)) errors.tag = s.errorVarietyTagRequired
  const limit = draft.maxPerWeek
  if (limit === null && !draft.notConsecutiveDays) errors.maxPerWeek = s.errorNothingLimited
  else if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 21)) errors.maxPerWeek = s.errorMaxRange
  return errors
}

export const hasFieldErrors = (errors: object): boolean => Object.values(errors).some(Boolean)

/**
 * "Slot Rule Friday Dinner · Main = Curry", "Slot Rule Friday Dinner = Pizza": the Meal Slot, the Course the rule names (when it
 * names one and the slot has several), and the Recipe or the Tag by its name.
 */
export function slotRuleName(rule: SlotRule, mealSlots: readonly MealSlotChoice[], tags: readonly Tag[], recipes: readonly RecipeChoice[]): string {
  const slot = mealSlots.find((m) => m.id === rule.mealSlotId)
  const label = slot ? mealSlotLabel(slot.weekday, slot.name) : s.unknownMealSlot
  const course = rule.courseId === undefined ? null : ruleCourseName(slot, rule.courseId)
  const what =
    rule.recipeId !== undefined ? (rule.recipeName ?? recipes.find((x) => x.id === rule.recipeId)?.name ?? '') : tagPill(tags, rule.tag ?? '').label
  return r.slotRuleName(slotRuleTitle(label, course), what)
}

/** "Variety Rule for fish", the Tag by its name. */
export function varietyRuleName(rule: Pick<VarietyRule, 'tag'>, tags: readonly Tag[]): string {
  return r.varietyRuleName(tagPill(tags, rule.tag).label)
}

/** What puts a removed Slot Rule back: POST /api/slot-rules with the same Meal Slot, Course, and Recipe or Tag. */
export function slotRuleBodyOf(rule: SlotRule): { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string } {
  return {
    mealSlotId: rule.mealSlotId,
    ...(rule.courseId !== undefined ? { courseId: rule.courseId } : {}),
    ...(rule.recipeId !== undefined ? { recipeId: rule.recipeId } : { tag: rule.tag ?? '' }),
  }
}
