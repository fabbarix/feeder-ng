// What the Leftover sheets need besides the Leftover: the Storage Places, the Frozen Use-by of the Recipe and of the Household,
// and the Recipe's Use-by days. Read straight from the API (no feature import); nothing is read without a Recipe (no sheet open).
import { useQuery } from '@tanstack/react-query'
import { http } from '../http'
import type { LeftoverPlace } from './types'

/** The Household's Frozen Use-by and Use-by days while the settings cannot be read (the server defaults). */
const HOUSEHOLD_FROZEN_USE_BY = 90
const USE_BY_DAYS = 3

const NO_PLACES: LeftoverPlace[] = []

export interface LeftoverSheetContext {
  storagePlaces: LeftoverPlace[]
  /** The Recipe's Frozen Use-by, else null (the Household's applies). */
  recipeFrozenUseBy: number | null
  householdFrozenUseBy: number
  /** The Recipe's Use-by days, else the Household's default. */
  recipeUseByDays: number
  /** True while a read the sheet needs is in flight: the sheet waits, so its defaults see the places. */
  loading: boolean
}

interface HouseholdRead {
  frozenUseByDays?: number
  defaultLeftoverUseByDays?: number
}

interface RecipeRead {
  frozenUseByDays?: number | null
  leftoverUseByDays?: number | null
}

/** Reads the Storage Places (shared with the Pantry's key), the Household settings and the Recipe, only while `recipeId` is given. */
export function useLeftoverSheetContext(recipeId: number | null): LeftoverSheetContext {
  const enabled = recipeId !== null
  const places = useQuery({
    queryKey: ['stock', 'places'],
    queryFn: () => http.get<LeftoverPlace[]>('/api/storage-places'),
    enabled,
  })
  const household = useQuery({
    queryKey: ['household', 'settings'],
    queryFn: () => http.get<HouseholdRead>('/api/household/settings'),
    enabled,
  })
  const recipe = useQuery({
    queryKey: ['leftovers', 'recipe', recipeId],
    queryFn: () => http.get<RecipeRead>(`/api/recipes/${recipeId}`),
    enabled,
  })
  return {
    storagePlaces: places.data ?? NO_PLACES,
    recipeFrozenUseBy: recipe.data?.frozenUseByDays ?? null,
    householdFrozenUseBy: household.data?.frozenUseByDays ?? HOUSEHOLD_FROZEN_USE_BY,
    recipeUseByDays: recipe.data?.leftoverUseByDays ?? household.data?.defaultLeftoverUseByDays ?? USE_BY_DAYS,
    loading: enabled && (places.isPending || household.isPending || recipe.isPending),
  }
}
