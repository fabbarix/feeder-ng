// Naming a Slot Rule in a confirm: "Friday Dinner · Main". Plain TypeScript, no React.
import type { RuleLike } from '../types'

/** "Friday Dinner · Main": weekday and Meal Slot name, then the Course name. Missing parts are left out; no Meal Slot name gives "Meal Slot". */
export function slotRuleWhere(_rule: RuleLike): string {
  throw new Error('TG-S: not implemented')
}

/** "Friday Dinner · Main = fish". */
export function slotRuleLine(_rule: RuleLike, _tagName: string): string {
  throw new Error('TG-S: not implemented')
}
