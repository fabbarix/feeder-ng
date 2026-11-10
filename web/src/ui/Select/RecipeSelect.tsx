import { useMemo } from 'react'
import { Select, type SelectFieldProps } from './Select'
import type { SelectFilter, SelectSort } from './buildList'
import { recipeOptions, type RecipeChoice } from './options'
import type { SelectOption } from './lib'

export interface RecipeSelectProps extends SelectFieldProps {
  recipes: RecipeChoice[]
  value: number | null
  onChange: (id: number) => void
  /** Hide Recipes already planned, etc.: the caller filters; this only lists. */
}

const lastCookedCompare = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return b.localeCompare(a)
}

/** Recipes with thumbs, a Tag filter per distinct Tag, and sorts by Name then Last cooked (most recent first, never-cooked last). */
export function RecipeSelect({ recipes, value, onChange, ...field }: RecipeSelectProps) {
  const options = useMemo(() => recipeOptions(recipes), [recipes])
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [recipes])
  const filters = useMemo<SelectFilter<number>[]>(
    () => tags.map((tag) => ({ id: tag, label: tag, predicate: (o: SelectOption<number>) => o.keywords?.includes(tag) ?? false })),
    [tags],
  )
  const sorts = useMemo<SelectSort<number>[]>(() => {
    const cooked = new Map(recipes.map((r) => [r.id, r.lastCookedAt]))
    return [
      { id: 'name', label: 'Name', compare: (a, b) => a.label.localeCompare(b.label) },
      { id: 'cooked', label: 'Last cooked', compare: (a, b) => lastCookedCompare(cooked.get(a.value), cooked.get(b.value)) },
    ]
  }, [recipes])
  return (
    <Select<number>
      {...field}
      entityName="Recipe"
      options={options}
      filters={filters}
      sorts={sorts}
      value={value}
      onChange={onChange}
    />
  )
}

