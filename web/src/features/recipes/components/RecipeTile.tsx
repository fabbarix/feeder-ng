import type { ReactNode } from 'react'
import type { RecipeSummary } from '../types'

export interface RecipeTileProps {
  recipe: RecipeSummary
  onOpen: (id: number) => void
}

/**
 * A Bento Tile (ui/Tile, Chip) for the Recipes list. Photo (`imageUrl`) or the generated illustrated
 * tile from lib/tileArt (Tag icon + initial on an accent tone). Shows the name, the total time
 * (formatMinutes; "No Steps" when 0), an "+4 h advance" Chip for Advance Steps and a Ready Meal /
 * Archived Chip. The whole tile is one button named after the Recipe.
 */
export function RecipeTile(_props: RecipeTileProps): ReactNode {
  throw new Error('TODO')
}
