// B9-27 (RX-04): the muted detail under an Ingredient line on Recipe detail. Plain TypeScript.
import { recipeStrings } from '../strings'
import type { RecipeLine } from '../types'

/** "Optional · crushed", "Optional", the note alone, or '' for a line with neither. An empty Base recipe line says "No Ingredients yet". */
export function lineDetail(line: Pick<RecipeLine, 'optional' | 'note' | 'baseRecipe'>): string {
  const parts: string[] = []
  if (line.optional) parts.push(recipeStrings.lines.optional)
  const note = line.note.trim()
  if (note) parts.push(note)
  if (line.baseRecipe?.empty) parts.push(recipeStrings.baseRecipe.noIngredients)
  return parts.join(' · ')
}
