import { useState } from 'react'
import { useConfirm, useToast } from '../../../ui'
import { regenerateConfirmCopy, regenerateImpact } from '../lib/regenerate'
import { planStrings } from '../strings'
import type { SlotKey } from '../types'
import { useAlternatives } from './useAlternatives'
import { useCookFlow } from './useCookFlow'
import { usePlan } from './usePlan'
import { usePlanActions } from './usePlanActions'
import { useRecipeChoices } from './useRecipeChoices'

/** Everything the Plan screen needs: the plan, its actions and which sheet is open for which slot (one at a time). */
export function usePlanScreen() {
  const plan = usePlan()
  const actions = usePlanActions()
  const flow = useCookFlow()
  const toast = useToast()
  const [plannedKey, setPlannedKey] = useState<SlotKey | null>(null)
  const [swapKey, setSwapKey] = useState<SlotKey | null>(null)
  const [chooseKey, setChooseKey] = useState<SlotKey | null>(null)
  const alternatives = useAlternatives(swapKey)
  const choices = useRecipeChoices(chooseKey !== null)
  const confirm = useConfirm()

  const slotAt = (key: SlotKey | null) => (key ? (plan.slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId) ?? null) : null)
  const swapSlot = slotAt(swapKey)

  return {
    plan,
    actions,
    flow,
    alternatives,
    choices,
    plannedSlot: slotAt(plannedKey),
    swapSlot,
    plannedOpen: plannedKey !== null,
    swapOpen: swapKey !== null,
    chooseOpen: chooseKey !== null,
    openPlanned: setPlannedKey,
    closePlanned: () => setPlannedKey(null),
    openSwap: setSwapKey,
    closeSwap: () => setSwapKey(null),
    openChoose: setChooseKey,
    closeChoose: () => setChooseKey(null),
    /** From the Planned Meal sheet: close it, then act. One sheet at a time. */
    fromSheet: (act: () => void) => {
      setPlannedKey(null)
      act()
    },
    pickAlternative: async (recipeId: number) => {
      if (!swapKey) return
      const before = swapSlot?.meal
      const key = swapKey
      setSwapKey(null)
      if (!(await actions.setMeal(key, recipeId)) || !before) return
      toast.show(planStrings.swapped, {
        status: 'success',
        actionLabel: planStrings.undo,
        onAction: () => void actions.restore(key, before.recipeId, before.pinned),
      })
    },
    /** Regenerate asks first (2.4): the count of Planned Meals that will change; the POST only after a yes. */
    askRegenerate: async () => {
      const copy = regenerateConfirmCopy(regenerateImpact(plan.slots, plan.today))
      if (await confirm.confirm({ title: copy.title, body: copy.body, confirmLabel: copy.confirmLabel })) await actions.regenerate()
    },
    pickRecipe: async (recipeId: number) => {
      if (!chooseKey) return
      const key = chooseKey
      setChooseKey(null)
      await actions.setMeal(key, recipeId)
    },
  }
}
