import type { ReactNode } from 'react'
import { Select } from '../../../ui'
import { RECIPE_SORTS, type RecipeSort } from '../lib/sort'
import { recipeStrings } from '../strings'

export interface RecipeSortSelectProps {
  value: RecipeSort
  onChange: (sort: RecipeSort) => void
}

const labelOf: Record<RecipeSort, string> = {
  name: recipeStrings.sort.name,
  last_cooked_asc: recipeStrings.sort.longestAgo,
  last_cooked_desc: recipeStrings.sort.mostRecent,
}

/** The short value the chip shows; the list keeps the long label. */
const shortOf: Partial<Record<RecipeSort, string>> = {
  last_cooked_asc: recipeStrings.sort.longestAgoShort,
  last_cooked_desc: recipeStrings.sort.mostRecentShort,
}

/** Beta.5 F7: the Sort select of the Recipes list, built on the shared Select (no native control). hf-recipes-filter: a compact chip with the sort icon. */
export function RecipeSortSelect({ value, onChange }: RecipeSortSelectProps): ReactNode {
  return (
    <Select<RecipeSort>
      label={recipeStrings.sort.label}
      appearance="chip"
      icon="sort"
      options={RECIPE_SORTS.map((s) => ({ value: s, label: labelOf[s], triggerLabel: shortOf[s] }))}
      value={value}
      onChange={onChange}
    />
  )
}
