import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ingredientsApi } from '../../ingredients/api'
import type { IngredientChoice } from '../types'
import { isSupply } from '../lib/supplies'

const byName = (a: IngredientChoice, b: IngredientChoice) => a.name.localeCompare(b.name)

/**
 * Ingredients to pick from when adding a Stock Lot (GET /api/ingredients, team T2): food first, then the Supplies, each by name.
 * Both kinds come (no ?kind=). A choice carries its kind and Restock level (a food Ingredient has none). `group` is "Ingredients" and
 * "Supplies" only while the Household has a Supply; without one the list has no subheaders.
 */
export function useIngredientChoices(): { choices: IngredientChoice[]; isLoading: boolean } {
  const list = useQuery({ queryKey: ['ingredients'], queryFn: () => ingredientsApi.list() })
  const choices = useMemo(() => {
    const all = (list.data ?? []).map<IngredientChoice>((i) => ({
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      imageUrl: i.imageUrl,
      kind: i.kind === 'supply' ? 'supply' : 'food',
      restockLevel: i.kind === 'supply' ? (i.restockLevel ?? null) : null,
    }))
    const hasSupply = all.some(isSupply)
    const food = all.filter((c) => !isSupply(c)).sort(byName)
    const supplies = all.filter(isSupply).sort(byName)
    if (!hasSupply) return food
    return [...food.map((c) => ({ ...c, group: 'Ingredients' })), ...supplies.map((c) => ({ ...c, group: 'Supplies' }))] as IngredientChoice[]
  }, [list.data])
  return { choices, isLoading: list.isLoading }
}
