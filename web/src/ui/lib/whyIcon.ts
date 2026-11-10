import type { IconName } from '../icons'

/** What made the planner choose a Recipe (docs/design/ui-fix-plan.md 4.3). */
export type WhyCause = 'overlap' | 'favourite' | 'useSoon' | 'slotRule' | 'inStock'

/** Icon of a why chip: overlap -> ingredientOverlap, favourite, useSoon, slotRule, inStock -> alreadyInStock, else `why`. */
export function whyIcon(_cause?: WhyCause): IconName {
  throw new Error('not implemented')
}
