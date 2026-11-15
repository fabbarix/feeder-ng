import type { ReactNode } from 'react'
import { Avatar, EmptyState, ErrorState, IconButton, ListGroup, ListRow, Skeleton } from '../../../ui'
import { useHouseholdPreferences } from '../hooks/useHouseholdPreferences'
import { exclusionSummary, isExcluded } from '../lib/preference'
import { recipeStrings } from '../strings'
import '../recipe-detail.css'

export interface IngredientExclusionListProps {
  ingredientId: number
  /** The Ingredient's name as the buttons say it: "Sam excludes garlic". */
  ingredientName: string
}

/**
 * Who excludes the Ingredient: a one-line summary ("Ben and Chiara exclude garlic.", A11Y 3), then one row per Member (Avatar, name, the
 * meta "Excludes garlic" for those who do, toggle). Changes save at once for that Member. Used by the Recipe line's Dialog and the
 * Ingredient page's Exclusions Tile (rx-pt.md section 5.4).
 */
export function IngredientExclusionList({ ingredientId, ingredientName }: IngredientExclusionListProps): ReactNode {
  const household = useHouseholdPreferences()
  if (household.isError) return <ErrorState message={recipeStrings.preferencesLoadError} onRetry={household.refetch} />
  if (household.isLoading) return <Skeleton variant="row" count={3} />
  if (household.members.length === 0) return <EmptyState headingLevel={3} title={recipeStrings.noMembers} />
  const excludes = (memberId: number) => isExcluded(household.prefsByMember[memberId]?.excludedIngredients ?? [], ingredientId)
  const names = household.members.filter((m) => excludes(m.id)).map((m) => m.name)
  return (
    <div className="ingredient-exclusions">
      <p className="ingredient-exclusions__summary">{exclusionSummary(names, ingredientName)}</p>
      <ListGroup label={recipeStrings.members}>
        {household.members.map((m) => {
          const excluded = excludes(m.id)
          return (
            <ListRow
              key={m.id}
              title={m.name}
              meta={excluded ? recipeStrings.excludesMeta(ingredientName) : undefined}
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
