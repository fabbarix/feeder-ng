import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/http'
import { connectEvents } from '../../../lib/sse'
import { cookApi } from '../api'
import { advanceSummary, type AdvanceSummary } from '../lib/advance'
import { coveredLines, readyBefore } from '../lib/baseSteps'
import { clearResume as forgetResume, readResume, resumePosition, saveResume } from '../lib/resume'
import { scopeOf } from '../lib/scope'
import { createNav, goBack, goNext, isFirst, isLast, type StepNav } from '../lib/steps'
import type { CookSource, CookStep, CookView } from '../types'

export interface UseCookSession {
  view: CookView | undefined
  isLoading: boolean
  error: Error | null
  /** The server answered 409 not_cookable (the meal is already cooked or skipped). */
  notCookable: boolean
  nav: StepNav
  /** The Step on screen; null for a Recipe with no Steps. */
  step: CookStep | null
  /** The Base recipes ready by the Step on screen (names). */
  ready: string[]
  /** "Béchamel from Stock": the Base recipes Stock covers, whose Steps are left out. */
  covered: string[]
  next(): void
  back(): void
  /** Bumped by repeat(); the screen uses it to re-announce or re-read the Step. */
  repeatCount: number
  repeat(): void
  advance: AdvanceSummary
  markAdvanceDone(stepIndex: number): Promise<void>
  /** Start (or re-use, server side) the timer of the Passive Step on screen. No-op on other Steps. */
  startStepTimer(): Promise<void>
  isFirst: boolean
  isLast: boolean
  /** The Planned Meal for T11's Mark as Cooked sheet; null for a Recipe scope. */
  markCookedKey: { date: string; mealSlotId: number; courseId: number } | null
  scope: string
  /** Forget the resume Step (the screen calls it after Mark as Cooked). Nothing is saved again until the cook moves. */
  clearResume(): void
}

const VIEW_KEY = ['cook', 'view'] as const

/**
 * Cook Mode state for one source. react-query ['cook','view',scope] fed by
 * cookApi.view(source). Refetches on SSE topic `cook` (marks changed elsewhere).
 * Reaching a Passive Step (by next/back, or because it is the first Step) starts
 * its timer once per Step per session through cookApi.startTimer({scope, step: index})
 * (the server keeps one timer per Step, so a second device is safe too).
 * PC-04 resume: once the Steps are in, it opens on the Step stored for this scope (lib/resume; a finished timer's "after" is the next
 * Step), and saves the Step on screen (with a Recipe cook's Batches) on open and on every next/back. Cooked, or 409 not_cookable,
 * forgets it.
 */
/** B9-45 (PC-05): `hold` (Cook Mode is on Get ready) starts no Step timer and saves no resume Step until it is let go. */
export function useCookSession(source: CookSource, options: { hold?: boolean } = {}): UseCookSession {
  const hold = options.hold === true
  const client = useQueryClient()
  const scope = scopeOf(source)
  const query = useQuery({
    queryKey: [...VIEW_KEY, scope],
    queryFn: () => cookApi.view(source),
    retry: (count, err) => !(err instanceof ApiError) && count < 2,
  })
  const view = query.data
  const steps = view?.steps ?? []

  const [index, setIndex] = useState(0)
  // The scope whose stored Step has been applied: once per scope, so a refetch never pulls the cook back.
  const [resumedScope, setResumedScope] = useState<string | null>(null)
  if (view && resumedScope !== scope) {
    setResumedScope(scope)
    setIndex(resumePosition(steps, readResume(scope)))
  }
  const resumed = resumedScope === scope
  const batches = source.kind === 'recipe' ? source.batches : undefined
  // After clearResume nothing is saved until the cook moves (leaving a Cooked meal must not store its Step again).
  const forgotten = useRef(false)
  const [repeatCount, setRepeatCount] = useState(0)
  const started = useRef<Set<number>>(new Set())
  const nav = createNav(steps.length, index)
  const step = steps[nav.index] ?? null
  const ready = readyBefore(steps)[nav.index] ?? []

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void client.invalidateQueries({ queryKey: [...VIEW_KEY] })
    const off = connection.subscribe('cook', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])

  const startFor = useCallback(
    async (s: CookStep) => {
      if (!s.timer || started.current.has(s.index)) return
      started.current.add(s.index)
      try {
        await cookApi.startTimer({ scope, step: s.index })
        void client.invalidateQueries({ queryKey: ['cook', 'timers'] })
      } catch {
        started.current.delete(s.index)
      }
    },
    [client, scope],
  )

  // Reaching a Passive Step starts its timer, once per Step.
  useEffect(() => {
    if (step && !hold) void startFor(step)
  }, [step, startFor, hold])

  // The Step on screen is the resume Step (on open and after every move).
  const stepIndex = step?.index
  useEffect(() => {
    if (!resumed || hold || stepIndex === undefined || forgotten.current) return
    saveResume(scope, stepIndex, { batches })
  }, [resumed, hold, stepIndex, scope, batches])

  const notCookable = query.error instanceof ApiError && query.error.code === 'not_cookable'
  useEffect(() => {
    if (!notCookable) return
    forgotten.current = true
    forgetResume(scope)
  }, [notCookable, scope])

  const clearResume = useCallback(() => {
    forgotten.current = true
    forgetResume(scope)
  }, [scope])

  const total = steps.length
  const markAdvanceDone = useCallback(
    async (stepIndex: number) => {
      await cookApi.setMark(scope, stepIndex, true)
      await client.invalidateQueries({ queryKey: [...VIEW_KEY] })
    },
    [client, scope],
  )

  const startStepTimer = useCallback(async () => {
    const s = steps[index]
    if (s?.timer) {
      started.current.add(s.index)
      await cookApi.startTimer({ scope, step: s.index })
      void client.invalidateQueries({ queryKey: ['cook', 'timers'] })
    }
  }, [client, index, scope, steps])

  return {
    view,
    isLoading: query.isLoading,
    error: query.error,
    notCookable,
    nav,
    step,
    ready,
    covered: coveredLines(view?.covered),
    next: () => {
      forgotten.current = false
      setIndex((i) => goNext(createNav(total, i)).index)
    },
    back: () => {
      forgotten.current = false
      setIndex((i) => goBack(createNav(total, i)).index)
    },
    repeatCount,
    repeat: () => setRepeatCount((n) => n + 1),
    advance: advanceSummary(view?.advance ?? []),
    markAdvanceDone,
    startStepTimer,
    isFirst: isFirst(nav),
    isLast: isLast(nav),
    markCookedKey: view?.meal && source.kind === 'meal' ? { date: view.meal.date, mealSlotId: view.meal.mealSlotId, courseId: source.courseId } : null,
    scope,
    clearResume,
  }
}
