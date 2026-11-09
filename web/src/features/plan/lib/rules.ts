import type { SlotRule, VarietyRule } from '../types'

/** Tags are matched by lower case with inner spaces collapsed (the server's recipe.TagKey). */
export function normaliseTag(tag: string): string {
  void [tag]
  throw new Error('TODO: developer')
}

/** "Recipe: Curry" or "Tag: pizza". */
export function describeSlotRule(rule: SlotRule): string {
  void [rule]
  throw new Error('TODO: developer')
}

/** "At most 2 a week", "Never on consecutive days", or both joined by ", ". */
export function describeVarietyRule(rule: VarietyRule): string {
  void [rule]
  throw new Error('TODO: developer')
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
  void [draft]
  throw new Error('TODO: developer')
}

/** "Friday Dinner" from weekday 5 (ISO, 1 = Monday) and the Meal Slot name. */
export function mealSlotLabel(weekday: number, name: string): string {
  void [weekday, name]
  throw new Error('TODO: developer')
}
