// CRS F (spec 11): Cook Mode on the slot's cooking timeline. The server schedules; the SPA filters, numbers, labels,
// gates Next and starts the timers of the items it reaches (once each, in the item's own Course scope).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { connectEvents } from '../../../lib/sse'
import { cookApi } from '../api'
import { coveredLines, readyBefore } from '../lib/baseSteps'
import { advanceGroups, courseMenuEntries, effectiveFilter, filterChips, itemCaption, plannedClock, toCookStep, unresolvedCourses, visibleItems, type CourseFilter, type CourseMenuEntry, type FilterChip, type VisibleItem } from '../lib/timeline'
import { reheatTimerOfCourse } from '../lib/reheat'
import { createNav, goBack, goNext, isFirst, isLast, type StepNav } from '../lib/steps'
import type { AdvanceGroup } from '../lib/timeline'
import type { CookStep, TimelineItem, TimelineView } from '../types'
import type { CookTimelineTarget } from '../types'
import { useItemGate } from './useItemGate'
import type { UseStepGate } from './useStepGate'
import { useTimers, type UseTimers } from './useTimers'

export interface UseCookTimeline {
  view: TimelineView | undefined
  isLoading: boolean
  error: Error | null
  /** The server answered 409 not_cookable: nothing is left to cook. */
  notCookable: boolean
  filter: CourseFilter
  setFilter: (filter: CourseFilter) => void
  chips: FilterChip[]
  /** The items of the current filter's list, in order. */
  items: VisibleItem[]
  /** Position in `items` (kept per filter, clamped to the list). */
  nav: StepNav
  /** The Step on screen (as the Step tile takes it); null when the list is empty. */
  step: CookStep | null
  /** The timeline item on screen. */
  item: TimelineItem | null
  /** The Base recipes ready by the item on screen (names), over the shown list (lib/baseSteps readyBefore). */
  ready: string[]
  /** "Béchamel from Stock": the Base recipes Stock covers, whose Steps are left out. */
  covered: string[]
  /** "Side · Green beans" on a timeline of several Courses; null otherwise. */
  caption: string | null
  /** The planned clock time of the item on screen, "18:40". */
  clock: string | null
  next: () => void
  back: () => void
  isFirst: boolean
  isLast: boolean
  /** Next is held by the next item's own Course timers (lib/timeline holdingTimersFor). */
  gate: UseStepGate
  /** The timers of the household (for the strip and the gate). */
  timers: UseTimers
  advance: AdvanceGroup[]
  markAdvanceDone: (scope: string, step: number) => Promise<void>
  courseMenu: CourseMenuEntry[]
  unresolved: { courseId: number; fresh: boolean }[]
}

const TIMELINE_KEY = ['cook', 'view', 'timeline'] as const

/**
 * Cook Mode state for one slot's timeline. ['cook','view','timeline',date,slot] fed by GET .../all; refetches on the SSE
 * topics `cook`, `plan`, `household` and after a reconnect. Reaching a Passive item starts its Step timer once, in the
 * item's scope; reaching a Reheat item starts the free Reheat timer of its Course unless that Course already has one.
 */
export function useCookTimeline(target: CookTimelineTarget): UseCookTimeline {
  const client = useQueryClient()
  const key = [...TIMELINE_KEY, target.date, target.mealSlotId] as const
  const query = useQuery({
    queryKey: key,
    queryFn: () => cookApi.timeline(target.date, target.mealSlotId),
    retry: (count, err) => !(err instanceof ApiError) && count < 2,
  })
  const view = query.data
  const timers = useTimers()

  // The chip asked for, and the filter shown: a Course that has resolved falls back to All (lib/timeline effectiveFilter).
  const [chosen, setChosen] = useState<CourseFilter>(target.courseId ?? 'all')
  const filter = view ? effectiveFilter(view, chosen) : chosen
  const [positions, setPositions] = useState<Record<string, number>>({})
  const items = view ? visibleItems(view, filter) : []
  const nav = createNav(items.length, positions[String(filter)] ?? 0)
  const current = items[nav.index] ?? null
  const item = current?.item ?? null
  const ready = readyBefore(items.map((i) => i.item))[nav.index] ?? []

  const setIndex = useCallback(
    (index: number) => setPositions((p) => ({ ...p, [String(filter)]: index })),
    [filter],
  )
  const setFilter = useCallback((next: CourseFilter) => setChosen(next), [])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void client.invalidateQueries({ queryKey: [...TIMELINE_KEY] })
    const offs = ['cook', 'plan', 'household'].map((topic) => connection.subscribe(topic, refresh))
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      offs.forEach((off) => off())
      offReconnect()
      connection.close()
    }
  }, [client])

  // Passive items start their Step timer once; Reheat items start the Reheat timer of their Course once, and only when
  // the timers are known and that Course has none (the Reheat screen may have started one).
  const started = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!item || !item.timer) return
    if (item.kind === 'passive' && item.step !== null) {
      const id = `${item.scope}#${item.step}`
      if (started.current.has(id)) return
      started.current.add(id)
      void cookApi
        .startTimer({ scope: item.scope, step: item.step })
        .then(() => client.invalidateQueries({ queryKey: ['cook', 'timers'] }))
        .catch(() => started.current.delete(id))
      return
    }
    if (item.kind === 'reheat' && !timers.isLoading) {
      const id = `${item.scope}#reheat`
      if (started.current.has(id)) return
      started.current.add(id)
      if (reheatTimerOfCourse(timers.timers, item.scope) !== null) return
      void cookApi
        .startTimer({ scope: item.scope, label: item.timer.label, durationSeconds: item.timer.durationSeconds })
        .then(() => client.invalidateQueries({ queryKey: ['cook', 'timers'] }))
        .catch(() => started.current.delete(id))
    }
  }, [item, timers.isLoading, timers.timers, client])

  const gate = useItemGate(items, nav.index, timers.items, () => {})
  const step = current ? toCookStep(current) : null
  const markAdvanceDone = useCallback(
    async (scope: string, stepIndex: number) => {
      await cookApi.setMark(scope, stepIndex, true)
      await client.invalidateQueries({ queryKey: [...TIMELINE_KEY] })
    },
    [client],
  )

  return {
    view,
    isLoading: query.isLoading,
    error: query.error,
    notCookable: query.error instanceof ApiError && query.error.code === 'not_cookable',
    filter,
    setFilter,
    chips: view ? filterChips(view) : [],
    items,
    nav,
    step,
    item,
    ready,
    covered: coveredLines(view?.covered),
    caption: view && item ? itemCaption(view, item) : null,
    clock: view && item ? plannedClock(view.time, view.totalMinutes, item.startSeconds) : null,
    next: () => setIndex(goNext(nav).index),
    back: () => setIndex(goBack(nav).index),
    isFirst: isFirst(nav),
    isLast: isLast(nav),
    gate: { ...gate, next: () => (gate.canNext ? setIndex(goNext(nav).index) : undefined) },
    timers,
    advance: view ? advanceGroups(view) : [],
    markAdvanceDone,
    courseMenu: view ? courseMenuEntries(view) : [],
    unresolved: view ? unresolvedCourses(view) : [],
  }
}
