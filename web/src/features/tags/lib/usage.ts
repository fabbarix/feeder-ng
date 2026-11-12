// What uses a Tag, as the row's line: "12 Recipes · 1 Slot Rule · Variety Rule". Plain TypeScript, no React.
import type { Tag } from '../../../lib/tags'

/** "No Recipes yet", "1 Recipe", "12 Recipes". */
export function recipesPhrase(_n: number): string {
  throw new Error('TG-S: not implemented')
}

/** Recipes always; then "1 Slot Rule" / "2 Slot Rules" when any; then "Variety Rule" when there is one; joined with " · ". */
export function usageLine(_tag: Pick<Tag, 'recipes' | 'slotRules' | 'varietyRule'>): string {
  throw new Error('TG-S: not implemented')
}

/** The row's accessible name: "fish, 12 Recipes · 1 Slot Rule · Variety Rule". */
export function rowLabel(_tag: Pick<Tag, 'name' | 'recipes' | 'slotRules' | 'varietyRule'>): string {
  throw new Error('TG-S: not implemented')
}
