import { useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useConnectivity } from '../../../app/useConnectivity'
import { useMe } from '../../../app/useMe'
import { useConfirm } from '../../../ui'
import { planApi } from '../api'
import { courseOf, unresolvedCourseIds } from '../lib/courses'
import type { RegenerateDryRun } from '../lib/bought'
import { regenerateConfirmCopy, regenerateImpact } from '../lib/regenerate'
import type { SlotDayKey, SlotKey } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useAlternatives } from './useAlternatives'
import { useCookFlow, useNotCooked } from './useCookFlow'
import { usePlan } from './usePlan'
import { useMarkSlotRoute } from './useMarkSlotRoute'
import { useSlotDate } from './useSlotDate'
import { usePlanActions } from './usePlanActions'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'
import { useReplanReview } from './useReplanReview'
import { useResolvedUndo } from './useResolvedUndo'
import { useRecipeChoices } from './useRecipeChoices'
import { usePickLeftover } from './usePickLeftover'
import { useLeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { leftoversApi } from '../../../lib/leftovers/api'
import { leftoverKeys } from '../../../lib/leftovers/queryKeys'
import type { Leftover, LeftoverActionKind } from '../../../lib/leftovers/types'
import { mealLeftover } from '../lib/chooseMark'
import { chooserRecipes, sheetCourse } from '../lib/choose'

/** Everything the Plan screen needs: the plan, its actions and which sheet is open for which slot (one at a time). */
export function usePlanScreen() {
  const plan = usePlan()
  // w4d review (CLS): the tiles above the week (Couldn't plan, Leftovers to use) wait until both the plan and the Leftovers are in,
  // so they and the week appear together where the skeleton was, never pushing it down while it shows. The same query as the
  // Leftover flow's (deduplicated by React Query); only a first read in flight holds it (failed or offline, it does not).
  const leftoversRead = useQuery({ queryKey: leftoverKeys.list, queryFn: leftoversApi.list })
  const topReady = plan.state !== 'loading' && !(leftoversRead.isPending && leftoversRead.fetchStatus === 'fetching')
  const actions = usePlanActions()
  const flow = useCookFlow()
  // B9-26 (PC-01): another User's edit is announced on the Plan; `review` is the What changed sheet and the marked rows.
  usePlanLiveUpdates({ announce: true })
  const review = useReplanReview()
  const { offline } = useConnectivity()
  const timeZone = useMe().data?.householdTimeZone
  const [plannedKey, setPlannedKey] = useState<SlotKey | null>(null)
  const [swapKey, setSwapKey] = useState<SlotKey | null>(null)
  const [chooseKey, setChooseKey] = useState<SlotKey | null>(null)
  /** True while the Regenerate dry run runs; a ref guards re-entry from a quick second tap. */
  const [regeneratePreviewing, setRegeneratePreviewing] = useState(false)
  const previewingRef = useRef(false)
  const alternatives = useAlternatives(swapKey)
  // B9-38 (PC-10): Choose a Recipe for a Course other than the main one also lists the Recipes not marked with it ("Other
  // Recipes"); the main one keeps the server's `?course=` list alone.
  const chooseSlot = chooseKey ? (plan.slots.find((x) => x.date === chooseKey.date && x.mealSlotId === chooseKey.mealSlotId) ?? null) : null
  const chooseMain = chooseSlot ? (sheetCourse(chooseSlot, chooseKey?.courseId)?.main ?? true) : true
  const marked = useRecipeChoices(chooseKey !== null, chooseKey?.courseId)
  const every = useRecipeChoices(chooseKey !== null && !chooseMain)
  const choices = chooseMain || !chooseKey
    ? marked
    : { recipes: chooserRecipes(marked.recipes, every.recipes, chooseKey.courseId), isLoading: marked.isLoading || every.isLoading }
  const notCooked = useNotCooked()
  const allCooked = useAllCookedFlow()
  const confirm = useConfirm()
  const slotDate = useSlotDate(plan.slots)
  const leftoverFlow = useLeftoverFlow(plan.today)
  const pick = usePickLeftover()
  useMarkSlotRoute({ flow, allCooked })
  const closePlanned = useCallback(() => setPlannedKey(null), [])
  const resolvedUndo = useResolvedUndo(closePlanned, flow.open)

  const slotAt = (key: SlotDayKey | null) => (key ? (plan.slots.find((s) => s.date === key.date && s.mealSlotId === key.mealSlotId) ?? null) : null)
  const swapSlot = slotAt(swapKey)
  /** The swapped Planned Meal's Bought info (null when not Bought or nothing is being swapped). */
  const swapBought = swapSlot && swapKey ? (courseOf(swapSlot, swapKey.courseId)?.meal?.bought ?? null) : null

  return {
    plan,
    actions,
    flow,
    review,
    /** B9-26: Regenerate and the sheet's Undo need the server. */
    offline,
    /** The Household's zone, for the time of day the Planned Meal sheet says a meal was marked. */
    timeZone,
    /** B9-26 (SAFE-03): the Undo actions of the Planned Meal sheet of a Cooked or Not cooked meal. */
    resolvedUndo,
    allCooked,
    /** B5-F1: the per-date choices of the slot blocks (Who's eating, Time, Not served) and their sheets. */
    slotDate,
    alternatives,
    choices,
    plannedSlot: slotAt(plannedKey),
    /** B9-38 (PC-09): the Leftover the open sheet's Cooked meal made (its block: Had it, Freeze it, ⋮), and its actions. */
    plannedLeftover: mealLeftover(leftoverFlow.leftovers, plannedKey),
    leftoverAction: (kind: LeftoverActionKind, leftover: Leftover) => {
      setPlannedKey(null)
      leftoverFlow.openSheet(kind, leftover)
    },
    /** B9-38 (PC-09): Not cooked from the sheet's ⋮ acts at once, with Undo (SAFE-03). */
    notCookedFromSheet: (key: SlotKey) => {
      setPlannedKey(null)
      void notCooked(key)
    },
    /** B9-38 (PC-10): the Course Swap and Choose a Recipe are for (their context line, search label and groups). */
    swapCourseId: swapKey?.courseId,
    chooseSlot,
    chooseCourseId: chooseKey?.courseId,
    /** The Course of the open Planned Meal sheet (undefined: the main Course). */
    plannedCourseId: plannedKey?.courseId,
    swapSlot,
    swapBought,
    plannedOpen: plannedKey !== null,
    swapOpen: swapKey !== null,
    chooseOpen: chooseKey !== null,
    openPlanned: setPlannedKey,
    closePlanned,
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
      const key = swapKey
      setSwapKey(null)
      // B9-26 (PC-01): the toast (What changed, Undo by the server's token) comes from the write itself.
      await actions.setMeal(key, recipeId, 'swap')
    },
    /** Regenerate asks first (2.4): the count and the Bought Planned Meals it would replace (a dry run, which writes nothing; a failed one asks with the count alone); the POST only after a yes. */
    askRegenerate: async () => {
      if (previewingRef.current || offline) return
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
      // SAFE-07: the outline Cancel has the focus (ConfirmDialog's default), so Enter never regenerates.
      if (await confirm.confirm({ title: copy.title, body: copy.body, note: copy.note, details: copy.details, confirmLabel: copy.confirmLabel })) await actions.regenerate()
    },
    /** True while the Regenerate dry run runs (the button shows its busy state). */
    regeneratePreviewing,
    pickRecipe: async (recipeId: number) => {
      if (!chooseKey) return
      const key = chooseKey
      setChooseKey(null)
      await actions.setMeal(key, recipeId, 'choose')
    },
    /** B9-38: a Recipe of "Other Recipes": marked with the Course and set there in one write. */
    pickOtherRecipe: async (recipeId: number) => {
      if (!chooseKey) return
      const key = chooseKey
      setChooseKey(null)
      await actions.setMeal(key, recipeId, 'choose', { markCourse: true })
    },
    /** B5-LOW: "From the freezer": pins the frozen Leftover (by id) to the Course chosen. */
    pickLeftover: async (leftoverId: number) => {
      const found = leftoverFlow.leftovers.find((l) => l.id === leftoverId)
      if (!chooseKey || !found) return
      const key = chooseKey
      setChooseKey(null)
      await pick(key, found)
    },
    /** B5-LOW: the Leftovers, the Leftover sheets and the Leftover details of the Plan. */
    leftovers: leftoverFlow,
    /** The plan and the Leftovers are in: the tiles above the week and the week itself show (until then, the skeleton alone). */
    topReady,
  }
}
