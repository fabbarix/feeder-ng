import { usePhraseContext } from './usePhraseContext'
import { wholeMealChip, type CourseRowModel } from '../lib/courses'
import { emptyRow, rowChips, type EmptyRowModel, type RowChip } from '../lib/rowChips'
import { rowActions, type RowAction } from '../lib/rowActions'
import type { PlanSlot } from '../types'

export interface PlanCourseRowView {
  /** The chips of a Planned Meal (empty for an empty Course). */
  chips: RowChip[]
  /** The icon actions at the row's end, in order. */
  actions: RowAction[]
  /** Set for an empty Course: its title, its "Not planned" chip and whether it can be chosen. */
  empty: EmptyRowModel | null
}

/** The view model of one Course row: what it says (chips), which icon actions it offers, and how an empty Course reads. */
export function usePlanCourseRow(row: CourseRowModel, slot: PlanSlot): PlanCourseRowView {
  const phrase = usePhraseContext(slot.date)
  const meal = row.course.meal
  return {
    chips: meal ? rowChips(meal, phrase, wholeMealChip(slot, row)) : [],
    actions: rowActions(meal),
    empty: meal ? null : emptyRow(row.course),
  }
}
