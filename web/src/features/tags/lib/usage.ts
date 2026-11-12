// What uses a Tag, as the row's line: "12 Recipes · 1 Slot Rule · Variety Rule". Plain TypeScript, no React.
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

/** The row's accessible name: "fish, 12 Recipes · 1 Slot Rule · Variety Rule". */
export function rowLabel(tag: Pick<Tag, 'name' | 'recipes' | 'slotRules' | 'varietyRule'>): string {
  return `${tag.name}, ${usageLine(tag)}`
}
