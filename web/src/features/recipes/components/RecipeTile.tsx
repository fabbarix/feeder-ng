import type { ReactNode } from 'react'
import { Chip, Tile } from '../../../ui'
import { formatMinutes } from '../lib/time'
import { tileArt } from '../lib/tileArt'
import { recipeStrings } from '../strings'
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
export function RecipeTile({ recipe, onOpen }: RecipeTileProps): ReactNode {
  const art = tileArt(recipe.name, recipe.tags)
  return (
    <Tile size="md" tone={recipe.archived ? 'neutral' : 'accent'} onClick={() => onOpen(recipe.id)} className="recipe-tile">
      {recipe.imageUrl ? (
        <img src={recipe.imageUrl} alt="" className="recipe-tile__photo" loading="lazy" />
      ) : (
        <div className="recipe-tile__art" data-testid="recipe-art" data-icon={art.icon} data-tone={art.tone}>
          <span aria-hidden="true">{art.initial}</span>
        </div>
      )}
      <span className="recipe-tile__name">{recipe.name}</span>
      <span className="recipe-tile__time">
        {recipe.totalMinutes > 0 ? <span>{formatMinutes(recipe.totalMinutes)}</span> : <span>{recipeStrings.noSteps}</span>}
      </span>
      {recipe.advanceMinutes > 0 ? (
        <Chip tone="leftover">{recipeStrings.advanceChip(formatMinutes(recipe.advanceMinutes), recipeStrings.advanceWord)}</Chip>
      ) : null}
      {recipe.readyMeal ? <Chip>{recipeStrings.readyMeal}</Chip> : null}
      {recipe.archived ? <Chip>{recipeStrings.archived}</Chip> : null}
    </Tile>
  )
}
