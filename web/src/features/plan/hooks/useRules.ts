import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { ApiError } from '../../../lib/http'
import type { Tag } from '../../../lib/tags'
import { useUndoToast } from '../../../ui/useUndoToast'
import { planApi } from '../api'
import { ruleRemovalStrings } from '../lib/planningRulesStrings'
import { slotRuleBodyOf, slotRuleName, varietyRuleName } from '../lib/ruleForms'
import { rulesStrings } from '../lib/rulesStrings'
import { planStrings } from '../strings'
import type { MealSlotChoice, RecipeChoice, SlotRule, VarietyRule } from '../types'
import { invalidatePlan } from './planCache'
import { useRecipeChoices } from './useRecipeChoices'

const NONE: never[] = []

function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'duplicate_rule') return planStrings.duplicateRule
    if (e.code === 'tag_unknown') return rulesStrings.unknownTag
    return e.message || fallback
  }
  return e instanceof Error ? e.message : fallback
}

export interface UseSlotRules {
  rules: SlotRule[]
  mealSlots: MealSlotChoice[]
  recipes: RecipeChoice[]
  add: (body: { mealSlotId: number; courseId?: number; recipeId?: number; tag?: string }) => Promise<boolean>
  /** SAFE-02: removes at once and shows "<rule> removed" with Undo, which adds the same rule again. */
  remove: (id: number) => Promise<void>
  error: string | null
  isLoading: boolean
}

/**
 * Slot Rules plus the Meal Slots and Recipes the form chooses from. Invalidates ['plan'] on every change. `tags` (the screen's
 * useTags) name a Tag rule in its removal toast.
 */
export function useSlotRules(tags: readonly Tag[] = NONE): UseSlotRules {
  const client = useQueryClient()
  const undoToast = useUndoToast()
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

  const ruleList = rules.data
  const slotList = slots.data
  const recipeList = recipes.recipes
  const remove = useCallback(
    async (id: number) => {
      setError(null)
      const rule = ruleList?.find((r) => r.id === id)
      try {
        await planApi.removeSlotRule(id)
        await changed()
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
        return
      }
      if (!rule) return
      const name = slotRuleName(rule, slotList ?? NONE, tags, recipeList)
      undoToast.show({
        headline: ruleRemovalStrings.removed(name),
        restored: ruleRemovalStrings.back(name),
        undo: async () => {
          await planApi.addSlotRule(slotRuleBodyOf(rule))
          await changed()
        },
      })
    },
    [changed, ruleList, slotList, recipeList, tags, undoToast],
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
  /** SAFE-02: removes at once and shows "<rule> removed" with Undo, which saves the same rule again. */
  remove: (tag: string) => Promise<void>
  error: string | null
  isLoading: boolean
}

/** Variety Rules. `tags` (the screen's useTags) name the rule in its removal toast. */
export function useVarietyRules(tags: readonly Tag[] = NONE): UseVarietyRules {
  const client = useQueryClient()
  const undoToast = useUndoToast()
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

  const ruleList = rules.data
  const remove = useCallback(
    async (tag: string) => {
      setError(null)
      const rule = ruleList?.find((r) => r.tag === tag)
      try {
        await planApi.removeVarietyRule(tag)
        await changed()
      } catch (e) {
        setError(messageOf(e, planStrings.ruleSaveError))
        return
      }
      if (!rule) return
      const name = varietyRuleName(rule, tags)
      undoToast.show({
        headline: ruleRemovalStrings.removed(name),
        restored: ruleRemovalStrings.back(name),
        undo: async () => {
          await planApi.setVarietyRule(rule)
          await changed()
        },
      })
    },
    [changed, ruleList, tags, undoToast],
  )

  return { rules: rules.data ?? NONE, save, remove, error, isLoading: rules.isLoading }
}
