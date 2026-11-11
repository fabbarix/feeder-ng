// Test builders for useHouseholdPreferences (PT): a Household of Anna (linked to User 10) and Ben.
import { vi } from 'vitest'
import type { UseHouseholdPreferences } from './hooks/useHouseholdPreferences'
import type { MemberPreferences } from './types'

export const anna = { id: 1, name: 'Anna', colour: '#e91e63', avatar: '', userId: 10 }
export const ben = { id: 2, name: 'Ben', colour: '#2196f3', avatar: '🧔', userId: null as number | null }
export const cara = { id: 3, name: 'Cara', colour: '#4caf50', avatar: '', userId: 12 as number | null }

export function prefs(memberId: number, over: Partial<MemberPreferences> = {}): MemberPreferences {
  return { memberId, recipes: {}, excludedIngredients: [], ...over }
}

/** A loaded Household: Anna (You) and Ben, nobody has a preference. Pass overrides to change it. */
export function household(over: Partial<UseHouseholdPreferences> = {}): UseHouseholdPreferences {
  return {
    members: [anna, ben],
    meUserId: 10,
    isAdmin: false,
    prefsByMember: { 1: prefs(1), 2: prefs(2) },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    toggleRecipe: vi.fn().mockResolvedValue(undefined),
    toggleIngredient: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}
