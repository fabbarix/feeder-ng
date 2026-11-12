import { mealSlotLabel } from '../../../lib/mealSlots'
import { planStrings as s } from '../strings'
import type { CourseChoice } from '../../../lib/courses/types'
import type { MealSlotChoice, SlotRule, TagChoice, VarietyRule } from '../types'

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
export function toVarietyRule(draft: VarietyDraft): { rule: VarietyRule } | { error: VarietyDraftError } {
  const tag = normaliseTag(draft.tag)
  if (!tag) return { error: 'tag_required' }
  const limit = draft.maxPerWeek
  if (limit === null && !draft.notConsecutiveDays) return { error: 'nothing_limited' }
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 21)) return { error: 'max_range' }
  return { rule: { tag, maxPerWeek: limit ?? 0, notConsecutiveDays: draft.notConsecutiveDays } }
}

export { mealSlotLabel }

export interface SlotRuleDraft {
  mealSlotId: string
  kind: 'recipe' | 'tag'
  recipeId: string
  tag: string
  /** CRS F: the chosen Course ("" = none chosen: the slot serves one Course, the server then takes the main Course). */
  courseId?: string
}

export type SlotRuleDraftError = 'meal_slot_required' | 'tag_required' | 'recipe_required'

/** Validates the Slot Rule form: a Meal Slot, then a Recipe or a Tag. Returns the request body or the first error. */
export function toSlotRuleBody(
  draft: SlotRuleDraft,
): { body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string } } | { error: SlotRuleDraftError } {
  const course = draft.courseId ? { courseId: Number(draft.courseId) } : {}
  if (draft.kind === 'tag') {
    const tag = draft.tag.trim()
    if (!tag) return { error: 'tag_required' }
    if (!draft.mealSlotId) return { error: 'meal_slot_required' }
    return { body: { mealSlotId: Number(draft.mealSlotId), ...course, tag } }
  }
  if (!draft.recipeId) return { error: 'recipe_required' }
  if (!draft.mealSlotId) return { error: 'meal_slot_required' }
  return { body: { mealSlotId: Number(draft.mealSlotId), ...course, recipeId: Number(draft.recipeId) } }
}

export interface TagOption {
  value: string
  label: string
  /** "3 Recipes" / "1 Recipe". */
  meta: string
}

/** Options of the Tag selects: the existing Tags, sorted by name, each with its Recipe count as meta. */
export function toTagOptions(tags: TagChoice[]): TagOption[] {
  return [...tags]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ value: t.name, label: t.name, meta: s.recipeCount(t.recipes) }))
}

/** CRS F: the title of a Slot Rule row. "Friday Dinner · Main" when the rule's Course is shown, else just "Friday Dinner". */
export function slotRuleTitle(slotLabel: string, courseName: string | null): string {
  return courseName ? `${slotLabel} · ${courseName}` : slotLabel
}

/** TG-PW: the Courses of a Meal Slot as the Course select takes them (household order, as the slot lists them); [] for a slot without `courses`. */
export function slotCourseChoices(_slot: MealSlotChoice | undefined): CourseChoice[] {
  return []
}

/** TG-PW: the Course the form starts on for a slot: the main Course's id as a string, '' when the slot has no Courses. */
export function defaultCourseId(_slot: MealSlotChoice | undefined): string {
  return ''
}

/**
 * TG-PW: the Course name a Slot Rule row shows: only when the slot has several Courses. An absent `courseId` means the
 * main Course. null when the slot serves one Course (the row reads as before), is unknown, or no longer serves that Course.
 */
export function ruleCourseName(_slot: MealSlotChoice | undefined, _courseId: number | undefined): string | null {
  return null
}
