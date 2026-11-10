import type { IconName } from '../icons'

/** What made the planner choose a Recipe (docs/design/ui-fix-plan.md 4.3). */
export type WhyCause = 'overlap' | 'favourite' | 'useSoon' | 'slotRule' | 'inStock'

const WHY_ICONS: Record<WhyCause, IconName> = {
  overlap: 'ingredientOverlap',
  favourite: 'favourite',
  useSoon: 'useSoon',
  slotRule: 'slotRule',
  inStock: 'alreadyInStock',
}

/** Icon of a why chip: overlap -> ingredientOverlap, favourite, useSoon, slotRule, inStock -> alreadyInStock, else `why`. */
export function whyIcon(cause?: WhyCause): IconName {
  return cause ? WHY_ICONS[cause] : 'why'
}
