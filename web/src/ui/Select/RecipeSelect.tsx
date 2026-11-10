import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { RecipeChoice } from './options'

export interface RecipeSelectProps extends SelectFieldProps {
  recipes: RecipeChoice[]
  value: number | null
  onChange: (id: number) => void

  /** Hide Recipes already planned, etc.: the caller filters; this only lists. */
}

/** STUB (WP4 designer). Thin domain wrapper over Select: maps data with options.tsx, no fetching. */
export function RecipeSelect(_props: RecipeSelectProps): ReactNode {
  throw new Error('not implemented')
}
