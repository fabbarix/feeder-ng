import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ingredientsApi } from '../api'
import { totalReferences } from '../lib/references'
import type { BaseUnit } from '../../../lib/units'
import type { Conversion, Ingredient, IngredientDetail } from '../types'

export interface UseIngredient {
  ingredient: IngredientDetail | undefined
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  /** Sum of the reference counts; the Base Unit and deletion are locked while > 0. */
  referenceCount: number
  rename: (name: string) => Promise<Ingredient>
  setBaseUnit: (base: BaseUnit) => Promise<Ingredient>
  /** null clears the Shelf Life. */
  setShelfLife: (days: number | null) => Promise<Ingredient>
  /** IM2: the picture's image id; '' removes it. */
  setImage: (imageId: string) => Promise<Ingredient>
  setConversion: (c: Conversion) => Promise<Ingredient>
  removeConversion: (unit: string) => Promise<Ingredient>
  remove: () => Promise<void>
}

/** One Ingredient (react-query key ['ingredients', id]); every mutation refreshes it and the list. */
export function useIngredient(id: number): UseIngredient {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['ingredients', id], queryFn: () => ingredientsApi.get(id) })

  const refresh = () => client.invalidateQueries({ queryKey: ['ingredients'] })
  const changed = async <T>(request: Promise<T>): Promise<T> => {
    const result = await request
    await refresh()
    return result
  }

  const ingredient = query.data
  const referenceCount = totalReferences(ingredient?.references ?? {})

  return {
    ingredient,
    isLoading: query.isLoading,
    error: query.error,
    referenceCount,
    rename: (name) => changed(ingredientsApi.patch(id, { name })),
    setBaseUnit: (baseUnit) => changed(ingredientsApi.patch(id, { baseUnit })),
    setShelfLife: (shelfLifeDays) => changed(ingredientsApi.patch(id, { shelfLifeDays })),
    setImage: (image) => changed(ingredientsApi.patch(id, { image })),
    setConversion: (c) => changed(ingredientsApi.setConversion(id, c)),
    removeConversion: (unit) => changed(ingredientsApi.removeConversion(id, unit)),
    remove: async () => {
      await ingredientsApi.remove(id)
      client.removeQueries({ queryKey: ['ingredients', id], exact: true })
      await client.invalidateQueries({ queryKey: ['ingredients'], exact: true })
    },
  }
}
