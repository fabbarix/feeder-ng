import type { SlotRule, VarietyRule } from '../types'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Tags are matched by lower case with inner spaces collapsed (the server's recipe.TagKey). */
export function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
}

/** "Recipe: Curry" or "Tag: pizza". */
export function describeSlotRule(rule: SlotRule): string {
  return rule.recipeId !== undefined ? `Recipe: ${rule.recipeName ?? ''}` : `Tag: ${rule.tag ?? ''}`
}

/** "At most 2 a week", "Never on consecutive days", or both joined by ", ". */
export function describeVarietyRule(rule: VarietyRule): string {
  const parts: string[] = []
  if (rule.maxPerWeek > 0) parts.push(`At most ${rule.maxPerWeek} a week`)
  if (rule.notConsecutiveDays) parts.push(parts.length ? 'never on consecutive days' : 'Never on consecutive days')
  return parts.join(', ')
}

export interface VarietyDraft {
  tag: string
  /** Text of the weekly limit field; '' = no cap. */
  maxPerWeek: string
  notConsecutiveDays: boolean
}

export type VarietyDraftError = 'tag_required' | 'nothing_limited' | 'max_range'

/** Validates the form: a Tag, and a weekly limit of 1 to 21 and/or consecutive days forbidden. Returns the rule or the first error. */
export function toVarietyRule(draft: VarietyDraft): { rule: VarietyRule } | { error: VarietyDraftError } {
  const tag = normaliseTag(draft.tag)
  if (!tag) return { error: 'tag_required' }
  const text = draft.maxPerWeek.trim()
  let max = 0
  if (text !== '') {
    if (!/^-?\d+$/.test(text)) return { error: 'max_range' }
    max = Number(text)
    if (max < 1 || max > 21) return { error: 'max_range' }
  } else if (!draft.notConsecutiveDays) {
    return { error: 'nothing_limited' }
  }
  return { rule: { tag, maxPerWeek: max, notConsecutiveDays: draft.notConsecutiveDays } }
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
