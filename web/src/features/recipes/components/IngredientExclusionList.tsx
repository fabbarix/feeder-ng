import type { ReactNode } from 'react'
import { Avatar, EmptyState, IconButton, ListGroup, ListRow } from '../../../ui'
import { useHouseholdPreferences } from '../hooks/useHouseholdPreferences'
import { isExcluded } from '../lib/preference'
import { recipeStrings } from '../strings'

export interface IngredientExclusionListProps {
  ingredientId: number
  /** The Ingredient's name as the buttons say it: "Sam: excludes garlic". */
  ingredientName: string
}

/**
 * Who excludes the Ingredient: one row per Member (Avatar, name, toggle). Changes save at once for that Member. Used by
 * the Recipe line's Dialog and the Ingredient page's Excluded by Tile (rx-pt.md section 5.4).
 */
export function IngredientExclusionList({ ingredientId, ingredientName }: IngredientExclusionListProps): ReactNode {
  const household = useHouseholdPreferences()
  if (household.members.length === 0) return <EmptyState headingLevel={3} title={recipeStrings.noMembers} />
  return (
    <div className="ingredient-exclusions">
    <ListGroup label={recipeStrings.members}>
      {household.members.map((m) => {
        const excluded = isExcluded(household.prefsByMember[m.id]?.excludedIngredients ?? [], ingredientId)
        return (
          <ListRow
            key={m.id}
            title={m.name}
            leading={<Avatar name={m.name} imageUrl={m.photoUrl} colour={m.colour} glyph={m.avatar} size="md" />}
            trailing={
              <IconButton
                icon="exclusion"
                label={recipeStrings.excludesToggle(m.name, ingredientName)}
                pressed={excluded}
                onClick={() => void household.toggleIngredient(m.id, ingredientId)}
              />
            }
          />
        )
      })}
    </ListGroup>
    </div>
  )
}
