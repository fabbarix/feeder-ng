import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useMe } from '../../../app/useMe'
import { ApiError } from '../../../lib/http'
import { connectEvents } from '../../../lib/sse'
import { useToast } from '../../../ui'
import { useMembers } from '../../settings/hooks/useMembers'
import { recipesApi } from '../api'
import { isExcluded, nextState, stateOf } from '../lib/preference'
import type { PreferenceMember } from '../lib/preferenceRows'
import { recipeStrings } from '../strings'
import type { MemberPreferences, PreferenceState } from '../types'

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

const PREFERENCES_KEY = 'recipe-preferences'
const prefsKey = (memberId: number) => [PREFERENCES_KEY, memberId] as const

/**
 * Every Member's preferences (one GET /api/recipe-preferences?memberId= each), kept live by the "recipes" events.
 * The Recipe detail's table and the Ingredient Exclusion lists both read and write through it (rx-pt.md section 5.2).
 */
export function useHouseholdPreferences(): UseHouseholdPreferences {
  const client = useQueryClient()
  const toast = useToast()
  const settings = useMembers()
  const me = useMe()

  const members = useMemo<HouseholdMember[]>(
    () => settings.members.map((m) => ({ id: m.id, name: m.name, userId: m.userId, colour: m.colour, avatar: m.avatar, photoUrl: m.photoUrl || undefined })),
    [settings.members],
  )
  const queries = useQueries({
    queries: members.map((m) => ({
      queryKey: prefsKey(m.id),
      queryFn: () => recipesApi.preferences(m.id),
      retry: (count: number, err: Error) => !(err instanceof ApiError) && count < 2,
    })),
  })

  const prefsByMember: Record<number, MemberPreferences | undefined> = {}
  members.forEach((m, i) => {
    prefsByMember[m.id] = queries[i]?.data
  })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void client.invalidateQueries({ queryKey: [PREFERENCES_KEY] })
    const off = connection.subscribe('recipes', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])

  /** Shows the change at once, saves it, and restores the previous value with a Toast when the save fails. */
  const commit = async (
    memberId: number,
    optimistic: (prev: MemberPreferences) => MemberPreferences,
    send: () => Promise<MemberPreferences>,
    failure: string,
  ) => {
    const previous = client.getQueryData<MemberPreferences>(prefsKey(memberId))
    if (!previous) return
    client.setQueryData(prefsKey(memberId), optimistic(previous))
    try {
      client.setQueryData(prefsKey(memberId), await send())
    } catch {
      client.setQueryData(prefsKey(memberId), previous)
      toast.show(failure, { status: 'error' })
    }
    // react-query notifies its observers on a timer: wait for that, so the outcome is on screen when the caller resumes.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  const nameOf = (memberId: number) => members.find((m) => m.id === memberId)?.name ?? ''

  return {
    members,
    meUserId: me.data?.id ?? null,
    isAdmin: me.data?.isAdmin ?? false,
    prefsByMember,
    isLoading: settings.isPending || me.isLoading || queries.some((q) => q.isPending),
    isError: settings.isError || queries.some((q) => q.isError),
    refetch: () => void client.invalidateQueries({ queryKey: [PREFERENCES_KEY] }),
    toggleRecipe: async (memberId, recipeId, tapped) => {
      const current = client.getQueryData<MemberPreferences>(prefsKey(memberId))
      if (!current) return
      const next = nextState(stateOf(current.recipes, recipeId), tapped)
      const label = stateLabel(tapped)
      await commit(
        memberId,
        (prev) => {
          const recipes = { ...prev.recipes }
          if (next === 'none') delete recipes[String(recipeId)]
          else recipes[String(recipeId)] = next
          return { ...prev, recipes }
        },
        () => recipesApi.setRecipeState(recipeId, next, memberId),
        recipeStrings.saveFailed(nameOf(memberId), label),
      )
    },
    toggleIngredient: async (memberId, ingredientId) => {
      const current = client.getQueryData<MemberPreferences>(prefsKey(memberId))
      if (!current) return
      const excluded = !isExcluded(current.excludedIngredients, ingredientId)
      await commit(
        memberId,
        (prev) => ({
          ...prev,
          excludedIngredients: excluded
            ? [...prev.excludedIngredients, ingredientId].sort((a, b) => a - b)
            : prev.excludedIngredients.filter((id) => id !== ingredientId),
        }),
        () => recipesApi.setIngredientExclusion(ingredientId, excluded, memberId),
        recipeStrings.exclusionSaveFailed(nameOf(memberId)),
      )
    },
  }
}

function stateLabel(state: Exclude<PreferenceState, 'none'>): string {
  if (state === 'favourite') return recipeStrings.favourite
  if (state === 'dislike') return recipeStrings.dislike
  return recipeStrings.exclusion
}
