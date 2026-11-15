// B9-32 (PC-07): the Plan's Couldn't plan fixes that stay on the Plan: the "Show which meals" sheet and the "Mark Recipes as
// <Course>" sheet (from the tile's fix and from the Planned Meal sheet).
import { useCallback, useState } from 'react'
import { courseNameIn, unmarkedCount } from '../lib/couldntGroups'
import type { PlanEntry } from '../types'
import type { MarkCourse } from './useMarkCourseRecipes'

export interface PlanFixSheets {
  mealsOpen: boolean
  openMeals: () => void
  closeMeals: () => void
  /** The Course the Mark sheet is open for, with how many of its meals could not be planned; null while closed. */
  mark: { course: MarkCourse; count: number } | null
  /** Opens the Mark sheet for a Course (the tile's fix: id and name). */
  openMark: (course: MarkCourse) => void
  /** Opens it from a Course id alone (the Planned Meal sheet's "Mark Recipes as Side"). */
  openMarkById: (courseId: number) => void
  closeMark: () => void
}

/** `cells` are the plan's Course cells (courseCells of the plan's slots). */
export function usePlanFixSheets(cells: PlanEntry[]): PlanFixSheets {
  const [mealsOpen, setMealsOpen] = useState(false)
  const [mark, setMark] = useState<PlanFixSheets['mark']>(null)
  const openMark = useCallback((course: MarkCourse) => setMark({ course, count: unmarkedCount(cells, course.id) }), [cells])
  const openMarkById = useCallback((courseId: number) => openMark({ id: courseId, name: courseNameIn(cells, courseId) }), [cells, openMark])
  return {
    mealsOpen,
    openMeals: useCallback(() => setMealsOpen(true), []),
    closeMeals: useCallback(() => setMealsOpen(false), []),
    mark,
    openMark,
    openMarkById,
    closeMark: useCallback(() => setMark(null), []),
  }
}
