import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { planApi } from '../api'
import { planStrings } from '../strings'
import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'
import { invalidatePlan } from './planCache'
import { useRecipeChoices } from './useRecipeChoices'

const NONE: never[] = []

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.code === 'duplicate_rule' ? planStrings.duplicateRule : e.message || fallback
  return e instanceof Error ? e.message : fallback
}

export interface UseSlotRules {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  add: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => Promise<boolean>
  remove: (id: number) => Promise<void>
  error: string | null
  isLoading: boolean
}

/** Slot Rules plus the Meal Slots and Recipes the form chooses from. Invalidates ['plan'] on every change. */
export function useSlotRules(): UseSlotRules {
  const client = useQueryClient()
  const rules = useQuery({ queryKey: ['slot-rules'], queryFn: planApi.slotRules })
  const slots = useQuery({ queryKey: ['meal-slots'], queryFn: planApi.mealSlots })
  const recipes = useRecipeChoices()
  const [error, setError] = useState<string | null>(null)

  const changed = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ['slot-rules'] })
    await invalidatePlan(client)
  }, [client])

  const add = useCallback(
    async (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => {
      setError(null)
      try {
        await planApi.addSlotRule(body)
        await changed()
        return true
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
        return false
      }
    },
    [changed],
  )

  const remove = useCallback(
    async (id: number) => {
      setError(null)
      try {
        await planApi.removeSlotRule(id)
        await changed()
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
      }
    },
    [changed],
  )

  return {
    rules: rules.data ?? NONE,
    mealSlots: slots.data ?? NONE,
    recipes: recipes.recipes,
    add,
    remove,
    error,
    isLoading: rules.isLoading || slots.isLoading || recipes.isLoading,
  }
}

export interface UseVarietyRules {
  rules: VarietyRule[]
  save: (rule: VarietyRule) => Promise<boolean>
  remove: (tag: string) => Promise<void>
  error: string | null
  isLoading: boolean
}

export function useVarietyRules(): UseVarietyRules {
  const client = useQueryClient()
  const rules = useQuery({ queryKey: ['variety-rules'], queryFn: planApi.varietyRules })
  const [error, setError] = useState<string | null>(null)

  const changed = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ['variety-rules'] })
    await invalidatePlan(client)
  }, [client])

  const save = useCallback(
    async (rule: VarietyRule) => {
      setError(null)
      try {
        await planApi.setVarietyRule(rule)
        await changed()
        return true
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
        return false
      }
    },
    [changed],
  )

  const remove = useCallback(
    async (tag: string) => {
      setError(null)
      try {
        await planApi.removeVarietyRule(tag)
        await changed()
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
      }
    },
    [changed],
  )

  return { rules: rules.data ?? NONE, save, remove, error, isLoading: rules.isLoading }
}
