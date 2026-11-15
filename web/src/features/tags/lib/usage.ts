// What uses a Tag: the Tags row's value and meta (SET-11), and the line the confirms use. Plain TypeScript, no React.
import type { Tag } from '../../../lib/tags'

/** "No Recipes yet", "1 Recipe", "12 Recipes". */
export function recipesPhrase(n: number): string {
  if (n === 0) return 'No Recipes yet'
  return n === 1 ? '1 Recipe' : `${n} Recipes`
}

/** Recipes always; then "1 Slot Rule" / "2 Slot Rules" when any; then "Variety Rule" when there is one; joined with " · ". */
export function usageLine(tag: Pick<Tag, 'recipes' | 'slotRules' | 'varietyRule'>): string {
  const parts = [recipesPhrase(tag.recipes)]
  if (tag.slotRules > 0) parts.push(tag.slotRules === 1 ? '1 Slot Rule' : `${tag.slotRules} Slot Rules`)
  if (tag.varietyRule) parts.push('Variety Rule')
  return parts.join(' · ')
}

/** The row's value (SET-11): "12 Recipes", "1 Recipe", "None". */
export function recipeValue(n: number): string {
  if (n === 0) return 'None'
  return n === 1 ? '1 Recipe' : `${n} Recipes`
}

/** What else uses the Tag, under its name (SET-11): "1 Slot Rule · Variety Rule"; '' when nothing does. */
export function usageExtras(tag: Pick<Tag, 'slotRules' | 'varietyRule'>): string {
  const parts: string[] = []
  if (tag.slotRules > 0) parts.push(tag.slotRules === 1 ? '1 Slot Rule' : `${tag.slotRules} Slot Rules`)
  if (tag.varietyRule) parts.push('Variety Rule')
  return parts.join(' · ')
}

/** The row's accessible name, as the row reads (SET-11): "fish, 12 Recipes · 1 Slot Rule · Variety Rule", "Roast, None". */
export function rowLabel(tag: Pick<Tag, 'name' | 'recipes' | 'slotRules' | 'varietyRule'>): string {
  const extras = usageExtras(tag)
  return `${tag.name}, ${recipeValue(tag.recipes)}${extras ? ` · ${extras}` : ''}`
}
