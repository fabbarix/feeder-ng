import type { MemberPreferences } from '../types'
import type { PreferenceMember } from '../lib/preferenceRows'
import type { PreferenceState } from '../types'

export type HouseholdMember = PreferenceMember & { colour: string; avatar: string }

export interface UseHouseholdPreferences {
  /** Settings' Members, in Members order. */
  members: HouseholdMember[]
  /** The signed-in User's id (null when signed out); the Member whose userId matches is "You". */
  meUserId: number | null
  isAdmin: boolean
  /** Loaded preferences by Member id (react-query key ['recipe-preferences', memberId]). */
  prefsByMember: Record<number, MemberPreferences | undefined>
  isLoading: boolean
  /** True when the Members or any Member's preferences failed to load. */
  isError: boolean
  refetch: () => void
  /** Applies nextState(current, tapped) to the Member's state and saves it; optimistic, rolled back with a Toast on failure. Never rejects. */
  toggleRecipe: (memberId: number, recipeId: number, tapped: Exclude<PreferenceState, 'none'>) => Promise<void>
  /** Flips the Member's Exclusion of the Ingredient; optimistic, rolled back with a Toast on failure. Never rejects. */
  toggleIngredient: (memberId: number, ingredientId: number) => Promise<void>
}

/**
 * STUB (PT, step 1): every Member's preferences (one GET /api/recipe-preferences?memberId= each), kept live by the
 * "recipes" events. Replaces useRecipePreferences and useMemberPicker (rx-pt.md section 5.2).
 */
export function useHouseholdPreferences(): UseHouseholdPreferences {
  return {
    members: [],
    meUserId: null,
    isAdmin: false,
    prefsByMember: {},
    isLoading: false,
    isError: false,
    refetch: () => {},
    toggleRecipe: async () => {},
    toggleIngredient: async () => {},
  }
}
