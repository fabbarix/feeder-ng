import type { ReactNode } from 'react'
import { Chip, Icon, RecipeThumb, Tile } from '../../../ui'
import { timeSummary } from '../lib/timeSummary'
import { recipeStrings } from '../strings'
import type { RecipeSummary } from '../types'

export interface RecipeTileProps {
  recipe: RecipeSummary
  onOpen: (id: number) => void
  /** CRS E2: the Course names (household order) shown as chips. */
  courseNames?: readonly string[]
  /** CRS E2: add the Whole meal chip. */
  wholeMeal?: boolean
}

/**
 * A `media` Tile for the Recipes list: the photo or the generated RecipeThumb, the name (2-line clamp) and a separate
 * meta row with the total time ("No Steps" when none) and the "+4 h ahead" Chip. The whole tile is one link-like
 * button named after the Recipe. Ready Meal and Archived are tag Chips.
 */
export function RecipeTile({ recipe, onOpen }: RecipeTileProps): ReactNode {
  const time = timeSummary(recipe)
  const thumb = <RecipeThumb name={recipe.name} photoUrl={recipe.imageUrl || undefined} tags={recipe.tags} size="hero" />
  return (
    <Tile
      variant="media"
      className="recipe-tile"
      media={thumb}
      stretched={{ label: recipe.name, onActivate: () => onOpen(recipe.id) }}
    >
      <p className="recipe-tile__name">{recipe.name}</p>
      <div className="recipe-tile__meta">
        {time.total || !time.ahead ? (
          <span className="recipe-tile__time">
            <Icon name="duration" size={14} />
            {time.total ?? recipeStrings.noSteps}
          </span>
        ) : null}
        {time.ahead ? (
          <Chip kind="status" status="leftover" icon="advanceStep">
            {time.ahead}
          </Chip>
        ) : null}
      </div>
      {recipe.readyMeal || recipe.archived ? (
        <div className="recipe-tile__tags">
          {recipe.readyMeal ? <Chip kind="tag">{recipeStrings.readyMeal}</Chip> : null}
          {recipe.archived ? <Chip kind="tag">{recipeStrings.archived}</Chip> : null}
        </div>
      ) : null}
    </Tile>
  )
}
