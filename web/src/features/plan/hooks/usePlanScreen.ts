import { useRef, useState } from 'react'
import { useConfirm, useToast } from '../../../ui'
import { planApi } from '../api'
import { courseOf, unresolvedCourseIds } from '../lib/courses'
import type { RegenerateDryRun } from '../lib/bought'
import { regenerateConfirmCopy, regenerateImpact } from '../lib/regenerate'
import { planStrings } from '../strings'
import type { SlotDayKey, SlotKey } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useAlternatives } from './useAlternatives'
import { useCookFlow } from './useCookFlow'
import { usePlan } from './usePlan'
import { useMarkSlotRoute } from './useMarkSlotRoute'
import { useSlotDate } from './useSlotDate'
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
  /** True while the Regenerate dry run runs; a ref guards re-entry from a quick second tap. */
  const [regeneratePreviewing, setRegeneratePreviewing] = useState(false)
  const previewingRef = useRef(false)
  /** True while the Regenerate confirm is up: the page behind it is hidden from assistive tech (modal). */
  const [regenerateConfirming, setRegenerateConfirming] = useState(false)
  const alternatives = useAlternatives(swapKey)
  const choices = useRecipeChoices(chooseKey !== null, chooseKey?.courseId)
  const allCooked = useAllCookedFlow()
  const confirm = useConfirm()
  const slotDate = useSlotDate(plan.slots)
  useMarkSlotRoute({ flow, allCooked })

  const slotAt = (key: SlotDayKey | null) => (key ? (plan.slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId) ?? null) : null)
  const swapSlot = slotAt(swapKey)
  /** The swapped Planned Meal's Bought info (null when not Bought or nothing is being swapped). */
  const swapBought = swapSlot && swapKey ? (courseOf(swapSlot, swapKey.courseId)?.meal?.bought ?? null) : null

  return {
    plan,
    actions,
    flow,
    allCooked,
    /** B5-F1: the per-date choices of the slot blocks (Who's eating, Time, Not served) and their sheets. */
    slotDate,
    alternatives,
    choices,
    plannedSlot: slotAt(plannedKey),
    /** The Course of the open Planned Meal sheet (undefined: the main Course). */
    plannedCourseId: plannedKey?.courseId,
    swapSlot,
    swapBought,
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
    /** Mark all Cooked for the slot's Courses still to cook (one sheet, one POST). */
    openAllCooked: (key: SlotDayKey) => {
      const slot = slotAt(key)
      if (slot) allCooked.open({ date: key.date, mealSlotId: key.mealSlotId }, unresolvedCourseIds(slot))
    },
    pickAlternative: async (recipeId: number) => {
      if (!swapKey) return
      const before = swapSlot ? courseOf(swapSlot, swapKey.courseId)?.meal : undefined
      const key = swapKey
      setSwapKey(null)
      if (!(await actions.setMeal(key, recipeId)) || !before) return
      toast.show(planStrings.swapped, {
        status: 'success',
        actionLabel: planStrings.undo,
        onAction: () => void actions.restore(key, before.recipeId, before.pinned),
      })
    },
    /** Regenerate asks first (2.4): the count and the Bought Planned Meals it would replace (a dry run, which writes nothing; a failed one asks with the count alone); the POST only after a yes. */
    askRegenerate: async () => {
      if (previewingRef.current) return
      previewingRef.current = true
      setRegeneratePreviewing(true)
      let dryRun: RegenerateDryRun | null
      try {
        dryRun = await planApi.regenerateDryRun()
      } catch {
        dryRun = null
      } finally {
        previewingRef.current = false
        setRegeneratePreviewing(false)
      }
      const count = dryRun ? dryRun.replaces : regenerateImpact(plan.slots, plan.today)
      const copy = regenerateConfirmCopy(count, dryRun)
      setRegenerateConfirming(true)
      let yes: boolean
      try {
        yes = await confirm.confirm({ title: copy.title, body: copy.body, confirmLabel: copy.confirmLabel })
      } finally {
        setRegenerateConfirming(false)
      }
      if (yes) await actions.regenerate()
    },
    /** True while the Regenerate dry run runs (the button shows its busy state). */
    regeneratePreviewing,
    /** True while the Regenerate confirm is open. */
    regenerateConfirming,
    pickRecipe: async (recipeId: number) => {
      if (!chooseKey) return
      const key = chooseKey
      setChooseKey(null)
      await actions.setMeal(key, recipeId)
    },
  }
}
