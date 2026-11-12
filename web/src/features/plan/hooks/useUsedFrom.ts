// State of the Used from section(s): one Selection per Course. docs/dev/design/b5-ufw.md §3.
import type { LineView, LotConflict, UsedFromEntry, UsedFromNeed } from '../lib/usedFrom'

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

export function useUsedFrom(_courses: UsedFromCourseInput[]): UsedFromController {
  return {
    expanded: true,
    toggleExpanded: () => {},
    lines: () => [],
    summary: () => '',
    toggle: () => {},
    setAmount: () => {},
    entries: () => [{ ingredientId: -1, lots: [] }],
    conflicts: [],
    hasConflict: true,
    conflictMessages: [],
  }
}
