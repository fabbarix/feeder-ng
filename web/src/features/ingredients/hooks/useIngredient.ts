import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { ingredientsApi } from '../api'
import { totalReferences } from '../lib/references'
import type { BaseUnit } from '../../../lib/units'
import type { Conversion, Ingredient, IngredientDetail, IngredientKind, IngredientPatch } from '../types'

export interface UseIngredient {
  /** B9-20 (RES-02): loading, ready, offlineSaved, offlineUnknown or failed (a 404 is failed after one request). */
  state: ScreenState
  ingredient: IngredientDetail | undefined
  isLoading: boolean
  /** ApiError with status 404 when the id does not exist. */
  error: Error | null
  /** Fetches the Ingredient again (the error state's Try again). */
  refetch: () => void
  /** Sum of the reference counts; the Base Unit and deletion are locked while > 0. */
  referenceCount: number
  rename: (name: string) => Promise<Ingredient>
  /** B9-48 (SET-05): ONE PATCH with all the Keeping values; rejects with the server refusal. */
  save: (patch: IngredientPatch) => Promise<Ingredient>
  setBaseUnit: (base: BaseUnit) => Promise<Ingredient>
  /** null clears the Shelf Life. */
  setShelfLife: (days: number | null) => Promise<Ingredient>
  /** Pantry: the Shelf Life in a Freezer; null clears it. */
  setFrozenShelfLife: (days: number | null) => Promise<Ingredient>
  /** IM2: the picture's image id; '' removes it. */
  setImage: (imageId: string) => Promise<Ingredient>
  /** H5: a Supply's Restock level in Base Units; null clears it. */
  setRestockLevel: (level: number | null) => Promise<Ingredient>
  /** H5: food or Supply. A refusal rejects with the 409 kind_in_use ApiError (its reasons in details). */
  setKind: (kind: IngredientKind) => Promise<Ingredient>
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

  const state = useScreenState(query, { isEmpty: false, hasFilter: false })
  return {
    state,
    ingredient,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    referenceCount,
    rename: (name) => changed(ingredientsApi.patch(id, { name })),
    save: (patch) => changed(ingredientsApi.patch(id, patch)),
    setBaseUnit: (baseUnit) => changed(ingredientsApi.patch(id, { baseUnit })),
    setShelfLife: (shelfLifeDays) => changed(ingredientsApi.patch(id, { shelfLifeDays })),
    setFrozenShelfLife: (frozenShelfLifeDays) => changed(ingredientsApi.patch(id, { frozenShelfLifeDays })),
    setImage: (image) => changed(ingredientsApi.patch(id, { image })),
    setRestockLevel: (restockLevel) => changed(ingredientsApi.patch(id, { restockLevel })),
    setKind: (kind) => changed(ingredientsApi.patch(id, { kind })),
    setConversion: (c) => changed(ingredientsApi.setConversion(id, c)),
    removeConversion: (unit) => changed(ingredientsApi.removeConversion(id, unit)),
    remove: async () => {
      await ingredientsApi.remove(id)
      client.removeQueries({ queryKey: ['ingredients', id], exact: true })
      await client.invalidateQueries({ queryKey: ['ingredients'] })
    },
  }
}
