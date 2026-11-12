// CRS F: the sheets Today opens on the Tonight slot (the Planned Meal sheet, Swap, Choose a Recipe, Mark all Cooked).
import { useState } from 'react'
import { unresolvedCourseIds } from '../lib/courses'
import type { PlanSlot, SlotKey } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useAlternatives } from './useAlternatives'
import { usePlanActions } from './usePlanActions'
import { useRecipeChoices } from './useRecipeChoices'

/** The sheets of the Tonight slot on Today, one at a time per kind; `slot` is the hero slot the keys must match. */
export function useTonightSheets(slot: PlanSlot | null) {
  const actions = usePlanActions()
  const [plannedKey, setPlannedKey] = useState<SlotKey | null>(null)
  const [swapKey, setSwapKey] = useState<SlotKey | null>(null)
  const [chooseKey, setChooseKey] = useState<SlotKey | null>(null)
  const alternatives = useAlternatives(swapKey)
  const choices = useRecipeChoices(chooseKey !== null, chooseKey?.courseId)
  const allCooked = useAllCookedFlow()
  const matches = (key: SlotKey | null) => (slot && key && key.date === slot.date && key.mealSlotId === slot.mealSlotId ? slot : null)

  return {
    actions,
    planned: {
      key: plannedKey,
      slot: matches(plannedKey),
      courseId: plannedKey?.courseId,
      open: setPlannedKey,
      close: () => setPlannedKey(null),
    },
    swap: {
      key: swapKey,
      slot: matches(swapKey),
      open: setSwapKey,
      close: () => setSwapKey(null),
      alternatives: alternatives.alternatives,
      isLoading: alternatives.isLoading,
      pick: async (recipeId: number) => {
        const key = swapKey
        setSwapKey(null)
        if (key) await actions.setMeal(key, recipeId)
      },
    },
    choose: {
      key: chooseKey,
      open: setChooseKey,
      close: () => setChooseKey(null),
      recipes: choices.recipes,
      isLoading: choices.isLoading,
      pick: async (recipeId: number) => {
        const key = chooseKey
        setChooseKey(null)
        if (key) await actions.setMeal(key, recipeId)
      },
    },
    allCooked,
    /** Mark all Cooked for the Courses still to cook of a slot (the Tonight slot menu). */
    openAllCooked: (key: SlotKey) => {
      if (slot) allCooked.open({ date: key.date, mealSlotId: key.mealSlotId }, unresolvedCourseIds(slot))
    },
  }
}
