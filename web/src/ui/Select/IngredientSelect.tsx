import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import { ingredientOptions, type IngredientChoice } from './options'
import { selectStrings } from './strings'

export interface IngredientSelectProps extends SelectFieldProps {
  ingredients: IngredientChoice[]
  value: number | string | null
  onChange: (id: number | string) => void
  /** Adds the "Create Ingredient" row. */
  onCreate?: (query: string) => void
  /** R14: when set, the "Create Ingredient" row is shown disabled (aria-disabled) with this reason as its second line, and picking it does nothing. */
  createDisabledReason?: string
}

/** Ingredients with their Base Unit as meta (shown once); "Create Ingredient" for an unknown query when onCreate is given. */
export function IngredientSelect({ ingredients, value, onChange, onCreate, createDisabledReason, ...field }: IngredientSelectProps) {
  const options = useMemo(() => ingredientOptions(ingredients), [ingredients])
  return (
    <Select<number | string>
      {...field}
      entityName="Ingredient"
      options={options}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
      createDisabledReason={createDisabledReason}
      createLabel={selectStrings.createIngredient}
    />
  )
}
