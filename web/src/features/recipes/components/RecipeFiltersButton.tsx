// hf-recipes-filter: the Filters button of the Recipes header; its count chip shows while filters are on (docs/design/recipes-filter.md 4, 8).
import type { ReactNode, Ref } from 'react'
import { Button, Chip } from '../../../ui'
import { filtersButtonLabel } from '../lib/recipeFilters'
import { recipeStrings } from '../strings'

export interface RecipeFiltersButtonProps {
  /** Filters in force. */
  count: number
  /** Whether the panel is open. */
  expanded: boolean
  /** The id of the panel this button opens. */
  controls?: string
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}

export function RecipeFiltersButton({ count, expanded, controls, onClick, ref }: RecipeFiltersButtonProps): ReactNode {
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      icon="filter"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={filtersButtonLabel(count)}
      onClick={onClick}
    >
      {recipeStrings.filters.button}
      {count > 0 ? (
        <span aria-hidden="true">
          <Chip kind="count">{count}</Chip>
        </span>
      ) : null}
    </Button>
  )
}
