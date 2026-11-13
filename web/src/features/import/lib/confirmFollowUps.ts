// BR-E (design §13): what follows a Confirm that created or converted Base recipes: "Read Béchamel now" and the bulk link sheets. Pure.
import { importStrings } from '../strings'
import type { ImportResult } from '../types'

/** A created Base recipe the User chose to read next, with the line that asked for it. */
export interface ReadNextTarget {
  recipeId: number
  name: string
  line: string
}

/** The created Base recipes the User asked to read next ("Read it next"), in the answer's order. */
export function readNextItems(result: ImportResult): ReadNextTarget[] {
  return result.recipes
    .filter((r) => r.baseRecipe === true && r.readNext === true && r.action === 'created')
    .map((r) => ({ recipeId: r.id, name: r.name, line: r.line ?? '' }))
}

/** "Read Béchamel now". */
export function readNextLabel(name: string): string {
  return importStrings.baseRecipes.readNext(name)
}

/** Whether a Confirm leaves follow-ups: a Base recipe to link, or a read to start. A plannable Recipe alone leaves none. */
export function hasFollowUps(result: ImportResult): boolean {
  return bulkLinkTargets(result).length > 0 || readNextItems(result).length > 0
}

/** Each Base recipe the import created or converted, in the answer's order: the bulk link sheet opens for each. A replaced one is left out. */
export function bulkLinkTargets(result: ImportResult): Array<{ id: number; name: string }> {
  return result.recipes
    .filter((r) => r.baseRecipe === true && (r.action === 'created' || r.action === 'converted'))
    .map((r) => ({ id: r.id, name: r.name }))
}
