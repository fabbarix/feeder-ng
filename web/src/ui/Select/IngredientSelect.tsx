import type { ReactNode } from 'react'
import type { SelectFieldProps } from './Select'
import type { IngredientChoice } from './options'

export interface IngredientSelectProps extends SelectFieldProps {
  ingredients: IngredientChoice[]
  value: number | null
  onChange: (id: number) => void
  /** Adds the "Create Ingredient" row. */
  onCreate?: (query: string) => void
}

/** STUB (WP4 designer). Thin domain wrapper over Select: maps data with options.tsx, no fetching. */
export function IngredientSelect(_props: IngredientSelectProps): ReactNode {
  throw new Error('not implemented')
}
