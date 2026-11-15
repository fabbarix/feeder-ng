// CRS F: the sheets Today opens on the Tonight slot (the Planned Meal sheet, Swap, Choose a Recipe, Mark all Cooked).
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConnectivity } from '../../../app/useConnectivity'
import { useMe } from '../../../app/useMe'
import { courseOf, unresolvedCourseIds } from '../lib/courses'
import type { PlanSlot, SlotDayKey, SlotKey } from '../types'
import { useAllCookedFlow } from './useAllCookedFlow'
import { useAlternatives } from './useAlternatives'
import { usePlanActions } from './usePlanActions'
import { usePlanLiveUpdates } from './usePlanLiveUpdates'
import { useReplanReview } from './useReplanReview'
import { useResolvedUndo } from './useResolvedUndo'

import { useRecipeChoices } from './useRecipeChoices'
import { chooserRecipes, sheetCourse } from '../lib/choose'

const noop = () => {}
const matchesSlot = (slot: PlanSlot | null, key: SlotKey | null) => (slot && key && key.date === slot.date && key.mealSlotId === slot.mealSlotId ? slot : null)

/**
 * The sheets of the Tonight slot on Today, one at a time per kind; `slot` is the hero slot the keys must match. B9-26 (PC-01): its
 * writes show What changed, another User's edit is announced here (once for Today), and `review` drives TodayScreen's
 * ReplanReviewSheet.
 */
export function useTonightSheets(slot: PlanSlot | null, openMarkCooked: (key: SlotKey) => void = noop) {
  const actions = usePlanActions()
  usePlanLiveUpdates({ announce: true })
  const review = useReplanReview()
  const [plannedKey, setPlannedKey] = useState<SlotKey | null>(null)
  const closePlanned = useCallback(() => setPlannedKey(null), [])
  // B9-26 (SAFE-03): the Planned Meal sheet of a Cooked or Not cooked meal offers its Undo (not offline).
  const resolvedUndo = useResolvedUndo(closePlanned, openMarkCooked)
  const { offline } = useConnectivity()
  const timeZone = useMe().data?.householdTimeZone
  const [swapKey, setSwapKey] = useState<SlotKey | null>(null)
  const [chooseKey, setChooseKey] = useState<SlotKey | null>(null)
  const alternatives = useAlternatives(swapKey)
  const choices = useRecipeChoices(chooseKey !== null, chooseKey?.courseId)
  // B9-38 (PC-10, additive for B9-39): what Choose a Recipe needs to name its Course and list "Other Recipes" for a Course other
  // than the main one. `choose.recipes` stays the server's marked list; `choose.sheet` is the whole set for RecipeChooserSheet.
  const chooseSlot = matchesSlot(slot, chooseKey)
  const chooseMain = chooseSlot ? (sheetCourse(chooseSlot, chooseKey?.courseId)?.main ?? true) : true
  const every = useRecipeChoices(chooseKey !== null && !chooseMain)
  const allCooked = useAllCookedFlow()
  const navigate = useNavigate()
  const matches = (key: SlotKey | null) => (slot && key && key.date === slot.date && key.mealSlotId === slot.mealSlotId ? slot : null)
  const swapSlot = matches(swapKey)
  /** The swapped Course's Bought info (null when not Bought or nothing is being swapped). */
  const swapBought = swapSlot && swapKey ? (courseOf(swapSlot, swapKey.courseId)?.meal?.bought ?? null) : null

  return {
    actions,
    planned: {
      key: plannedKey,
      slot: matches(plannedKey),
      courseId: plannedKey?.courseId,
      open: setPlannedKey,
      close: closePlanned,
      /** B9-26 (SAFE-03): what the sheet of a Cooked or Not cooked meal needs for its Undo. */
      timeZone,
      offline,
      resolvedUndo,
      /** The Planned Meal sheet's routes: each closes the sheet, then navigates. */
      markRecipes: (courseId: number) => {
        setPlannedKey(null)
        navigate(`/recipes?notCourse=${courseId}`)
      },
      addRecipes: () => navigate('/recipes'),
      reviewVarietyRules: () => navigate('/settings/planning'),
    },
    swap: {
      key: swapKey,
      slot: swapSlot,
      bought: swapBought,
      /** B9-38: the Course being swapped (the sheet's context line and its "Now" row). */
      courseId: swapKey?.courseId,
      open: setSwapKey,
      close: () => setSwapKey(null),
      alternatives: alternatives.alternatives,
      isLoading: alternatives.isLoading,
      pick: async (recipeId: number) => {
        const key = swapKey
        setSwapKey(null)
        if (key) await actions.setMeal(key, recipeId, 'swap')
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
        if (key) await actions.setMeal(key, recipeId, 'choose')
      },
      /** B9-38: the slot and Course of the sheet (its context line, search label and groups). */
      slot: chooseSlot,
      courseId: chooseKey?.courseId,
      /** B9-38: the Recipes for RecipeChooserSheet: the marked list, plus "Other Recipes" for a Course other than the main one. */
      sheetRecipes: chooseMain || !chooseKey ? choices.recipes : chooserRecipes(choices.recipes, every.recipes, chooseKey.courseId),
      sheetLoading: choices.isLoading || (!chooseMain && every.isLoading),
      /** B9-38: a Recipe of "Other Recipes": marked with the Course and set there in one write. */
      pickOther: async (recipeId: number) => {
        const key = chooseKey
        setChooseKey(null)
        if (key) await actions.setMeal(key, recipeId, 'choose', { markCourse: true })
      },
    },
    allCooked,
    /** The What changed sheet of Today (PC-01). */
    review,
    /** Mark all Cooked for the Courses still to cook of a slot (the Tonight slot menu). */
    openAllCooked: (key: SlotDayKey) => {
      if (slot) allCooked.open({ date: key.date, mealSlotId: key.mealSlotId }, unresolvedCourseIds(slot))
    },
  }
}
