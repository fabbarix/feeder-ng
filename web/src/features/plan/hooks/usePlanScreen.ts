import { useState } from 'react'
import type { SlotKey } from '../types'
import { useAlternatives } from './useAlternatives'
import { useMarkCooked } from './useMarkCooked'
import { usePlan } from './usePlan'
import { usePlanActions } from './usePlanActions'
import { useRecipeChoices } from './useRecipeChoices'
import { useStockSheet } from './useStockSheet'

/** Everything the Plan screen needs: the plan, its actions and which sheet is open for which slot. */
export function usePlanScreen() {
  const plan = usePlan()
  const actions = usePlanActions()
  const [swapKey, setSwapKey] = useState<SlotKey | null>(null)
  const [chooseKey, setChooseKey] = useState<SlotKey | null>(null)
  const [cookKey, setCookKey] = useState<SlotKey | null>(null)
  const alternatives = useAlternatives(swapKey)
  const choices = useRecipeChoices(chooseKey !== null)
  const cook = useMarkCooked(cookKey)
  const stock = useStockSheet((id) => cook.dismissWarning(id))

  const swapSlot = swapKey ? (plan.slots.find((s) => s.date === swapKey.date && s.mealSlotId === swapKey.mealSlotId) ?? null) : null

  return {
    plan,
    actions,
    alternatives,
    choices,
    cook,
    stock,
    swapSlot,
    swapOpen: swapKey !== null,
    chooseOpen: chooseKey !== null,
    cookOpen: cookKey !== null,
    openSwap: setSwapKey,
    openChoose: setChooseKey,
    openCook: setCookKey,
    closeSwap: () => setSwapKey(null),
    closeChoose: () => setChooseKey(null),
    closeCook: () => setCookKey(null),
    pickAlternative: async (recipeId: number) => {
      if (!swapKey) return
      await actions.setMeal(swapKey, recipeId)
      setSwapKey(null)
    },
    pickRecipe: async (recipeId: number) => {
      if (!chooseKey) return
      await actions.setMeal(chooseKey, recipeId)
      setChooseKey(null)
    },
    confirmCooked: async () => {
      if (await cook.confirm()) setCookKey(null)
    },
    skipCooked: async () => {
      if (await cook.notCooked()) setCookKey(null)
    },
  }
}
