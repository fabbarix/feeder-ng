// State of the Used from section(s): one Selection per Course. docs/dev/design/b5-ufw.md §3.
import { useCallback, useMemo, useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import {
  conflictMessages, overPickedLots, setPickAmount, togglePick, toUsedFrom, usedFromLines, usedFromSummary,
  type LineView, type LotConflict, type Selection, type UsedFromEntry, type UsedFromNeed,
} from '../lib/usedFrom'

export interface UsedFromCourseInput {
  courseId: number
  courseName: string
  needs: UsedFromNeed[]
}

export interface UsedFromOptions {
  unitSystem: UnitSystem
  /** The household's date, YYYY-MM-DD: the go-off wording is relative to it. */
  today: string
}

export interface UsedFromController {
  /** Whether the Used from panel of a Course is open. Expansion is per Course. */
  expanded: (courseId: number) => boolean
  toggleExpanded: (courseId: number) => void
  lines: (courseId: number) => LineView[]
  summary: (courseId: number) => string
  toggle: (courseId: number, ingredientId: number, lotId: number, on: boolean) => void
  /** `null` clears the pick of the Lot. */
  setAmount: (courseId: number, ingredientId: number, lotId: number, amount: number | null) => void
  /** The `usedFrom` payload of a Course; undefined when nothing is picked. */
  entries: (courseId: number) => UsedFromEntry[] | undefined
  conflicts: LotConflict[]
  hasConflict: boolean
  /** Message per conflicting Lot, keyed by lotId. */
  conflictMessages: Record<number, string>
}

const NO_SELECTIONS: Record<number, Selection> = {}

/** Identifies the Lots the picks refer to: a reload with new Lots drops the picks. */
const signature = (courses: UsedFromCourseInput[]) => JSON.stringify(courses.map((c) => ({ courseId: c.courseId, needs: c.needs })))

export function useUsedFrom(courses: UsedFromCourseInput[], { unitSystem, today }: UsedFromOptions): UsedFromController {
  const [open, setOpen] = useState<Record<number, boolean>>({})
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

  const messages = useMemo(() => conflictMessages(conflicts, unitSystem), [conflicts, unitSystem])

  const needsOf = (courseId: number) => courses.find((c) => c.courseId === courseId)?.needs ?? []

  return {
    expanded: (courseId) => open[courseId] === true,
    toggleExpanded: (courseId) => setOpen((prev) => ({ ...prev, [courseId]: prev[courseId] !== true })),
    lines: (courseId) => usedFromLines(needsOf(courseId), selections[courseId] ?? {}, unitSystem, today),
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
    conflictMessages: messages,
  }
}
