// State of the Used from section(s): one Selection per Course. docs/dev/design/b5-ufw.md §3.
import { useCallback, useMemo, useState } from 'react'
import {
  overPickedLots, setPickAmount, togglePick, toUsedFrom, usedFromLines, usedFromSummary,
  type LineView, type LotConflict, type Selection, type UsedFromEntry, type UsedFromNeed,
} from '../lib/usedFrom'
import { usedFromStrings } from '../usedFromStrings'

export interface UsedFromCourseInput {
  courseId: number
  courseName: string
  needs: UsedFromNeed[]
}

export interface UsedFromController {
  expanded: boolean
  toggleExpanded: () => void
  lines: (courseId: number) => LineView[]
  summary: (courseId: number) => string
  toggle: (courseId: number, ingredientId: number, lotId: number, on: boolean) => void
  setAmount: (courseId: number, ingredientId: number, lotId: number, amount: number) => void
  /** The `usedFrom` payload of a Course; undefined when nothing is picked. */
  entries: (courseId: number) => UsedFromEntry[] | undefined
  conflicts: LotConflict[]
  hasConflict: boolean
  /** Message per conflict. */
  conflictMessages: string[]
}

const NO_SELECTIONS: Record<number, Selection> = {}

/** Identifies the Lots the picks refer to: a reload with new Lots drops the picks. */
const signature = (courses: UsedFromCourseInput[]) => JSON.stringify(courses.map((c) => ({ courseId: c.courseId, needs: c.needs })))

export function useUsedFrom(courses: UsedFromCourseInput[]): UsedFromController {
  const [expanded, setExpanded] = useState(false)
  const sig = signature(courses)
  const [store, setStore] = useState<{ sig: string; selections: Record<number, Selection> }>({ sig, selections: NO_SELECTIONS })
  const selections = store.sig === sig ? store.selections : NO_SELECTIONS

  const update = useCallback(
    (courseId: number, change: (needs: UsedFromNeed[], selection: Selection) => Selection) => {
      const course = courses.find((c) => c.courseId === courseId)
      if (!course) return
      setStore((prev) => {
        const base = prev.sig === sig ? prev.selections : NO_SELECTIONS
        return { sig, selections: { ...base, [courseId]: change(course.needs, base[courseId] ?? {}) } }
      })
    },
    [courses, sig],
  )

  const conflicts = useMemo(
    () => overPickedLots(courses.map((c) => ({ courseId: c.courseId, needs: c.needs, selection: selections[c.courseId] ?? {} }))),
    [courses, selections],
  )

  const needsOf = (courseId: number) => courses.find((c) => c.courseId === courseId)?.needs ?? []

  return {
    expanded,
    toggleExpanded: () => setExpanded((open) => !open),
    lines: (courseId) => usedFromLines(needsOf(courseId), selections[courseId] ?? {}),
    summary: (courseId) => usedFromSummary(needsOf(courseId), selections[courseId] ?? {}),
    toggle: (courseId, ingredientId, lotId, on) =>
      update(courseId, (needs, selection) => {
        const need = needs.find((n) => n.ingredientId === ingredientId)
        return need ? togglePick(selection, need, lotId, on) : selection
      }),
    setAmount: (courseId, ingredientId, lotId, amount) =>
      update(courseId, (needs, selection) => {
        const need = needs.find((n) => n.ingredientId === ingredientId)
        return need ? setPickAmount(selection, need, lotId, amount) : selection
      }),
    entries: (courseId) => toUsedFrom(needsOf(courseId), selections[courseId] ?? {}),
    conflicts,
    hasConflict: conflicts.length > 0,
    conflictMessages: conflicts.map((c) => usedFromStrings.conflict(c.ingredient, c.storagePlaceName)),
  }
}
