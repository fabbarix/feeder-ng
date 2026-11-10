import { planStrings as s } from '../strings'
import type { SlotRule, TagChoice, VarietyRule } from '../types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Tags are matched by lower case with inner spaces collapsed (the server's recipe.TagKey). */
export function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

/** "Recipe: Curry" or "Tag: pizza". */
export function describeSlotRule(rule: SlotRule): string {
  return rule.recipeId !== undefined ? s.ruleRecipe(rule.recipeName ?? '') : s.ruleTag(rule.tag ?? '')
}

/** "At most 2 a week", "Not on consecutive days", or both joined by ", ". */
export function describeVarietyRule(rule: VarietyRule): string {
  const parts: string[] = []
  if (rule.maxPerWeek > 0) parts.push(s.ruleAtMostPerWeek(rule.maxPerWeek))
  if (rule.notConsecutiveDays) parts.push(parts.length ? s.ruleNotConsecutiveLower : s.ruleNotConsecutive)
  return parts.join(', ')
}

export interface VarietyDraft {
  tag: string
  /** Value of the weekly limit NumberField; null = no cap. */
  maxPerWeek: number | null
  notConsecutiveDays: boolean
}

export type VarietyDraftError = 'tag_required' | 'nothing_limited' | 'max_range'

/** Validates the form: a Tag, and a weekly limit of 1 to 21 and/or consecutive days forbidden. Returns the rule or the first error. */
export function toVarietyRule(_draft: VarietyDraft): { rule: VarietyRule } | { error: VarietyDraftError } {
  throw new Error('not implemented (WP6)')
}

/** "Friday Dinner" from weekday 5 (ISO, 1 = Monday) and the Meal Slot name. */
export function mealSlotLabel(weekday: number, name: string): string {
  return `${WEEKDAYS[(weekday - 1 + 7) % 7]} ${name}`
}

export interface SlotRuleDraft {
  mealSlotId: string
  kind: 'recipe' | 'tag'
  recipeId: string
  tag: string
}

export type SlotRuleDraftError = 'meal_slot_required' | 'tag_required' | 'recipe_required'

/** Validates the Slot Rule form: a Meal Slot, then a Recipe or a Tag. Returns the request body or the first error. */
export function toSlotRuleBody(
  draft: SlotRuleDraft,
): { body: { mealSlotId: number; recipeId?: number; tag?: string } } | { error: SlotRuleDraftError } {
  if (draft.kind === 'tag') {
    const tag = draft.tag.trim()
    if (!tag) return { error: 'tag_required' }
    if (!draft.mealSlotId) return { error: 'meal_slot_required' }
    return { body: { mealSlotId: Number(draft.mealSlotId), tag } }
  }
  if (!draft.recipeId) return { error: 'recipe_required' }
  if (!draft.mealSlotId) return { error: 'meal_slot_required' }
  return { body: { mealSlotId: Number(draft.mealSlotId), recipeId: Number(draft.recipeId) } }
}

export interface TagOption {
  value: string
  label: string
  /** "3 Recipes" / "1 Recipe". */
  meta: string
}

/** Options of the Tag selects: the existing Tags, sorted by name, each with its Recipe count as meta. */
export function toTagOptions(_tags: TagChoice[]): TagOption[] {
  throw new Error('not implemented (WP6)')
}
