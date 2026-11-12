// Naming a Slot Rule in a confirm: "Friday Dinner · Main = fish". Plain TypeScript, no React.
import type { RuleLike } from '../types'

const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** "Friday Dinner · Main": weekday and Meal Slot name, then the Course name. Missing parts are left out; no Meal Slot name gives "Meal Slot". */
export function slotRuleWhere(rule: RuleLike): string {
  const day = rule.weekday !== undefined && rule.weekday >= 1 && rule.weekday <= 7 ? WEEKDAYS[rule.weekday] : undefined
  const slot = rule.mealSlotName || 'Meal Slot'
  const when = [day, slot].filter(Boolean).join(' ')
  return [when, rule.courseName || undefined].filter(Boolean).join(' · ')
}

/** "Friday Dinner · Main = fish". */
export function slotRuleLine(rule: RuleLike, tagName: string): string {
  return `${slotRuleWhere(rule)} = ${tagName}`
}
