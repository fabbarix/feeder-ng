// Test support for the plan feature: a routed fetch stub and a provider wrapper.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../ui'
import type { UsedFromController } from './hooks/useUsedFrom'

export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

type Reply = { status?: number; json?: unknown }
type Handler = Reply | unknown | ((call: RecordedCall) => Reply | unknown)

/** Stubs global fetch. Keys are "METHOD /path?query". A handler is a value (200 JSON), `{status, json}`, or a function of the call. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const call: RecordedCall = { method, path: input, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const key = `${method} ${input}`
    if (!(key in handlers)) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: `no stub for ${key}` } }), { status: 404 })
    }
    const h = handlers[key]
    const out = typeof h === 'function' ? (h as (c: RecordedCall) => unknown)(call) : h
    const reply = (out && typeof out === 'object' && ('status' in out || 'json' in out) ? out : { json: out }) as Reply
    const status = reply.status ?? (reply.json === undefined ? 204 : 200)
    return new Response(reply.json === undefined ? null : JSON.stringify(reply.json), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, callsTo: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path) }
}

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Query client, Toasts and the Confirm host (WP6: Regenerate confirms, Cooked toasts). */
export function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export function renderWithProviders(ui: ReactElement, route = '/'): RenderResult {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

import type { CookedAllResult, PlanCourse, PlanEntry, PlanSlot, PlannedMeal, Unfilled, Why } from './types'

export function meal(over: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    date: '2026-11-10', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken curry', batches: 1, portions: 2, state: 'planned',
    pinned: false, servedFromLeftover: null, why: [], ...over,
  }
}

/**
 * A slot as GET /api/plan sends it (crs-c3): its Courses, with the main Course's row built from `meal` and `unfilled`
 * (the arguments are a shorthand for that row). A flat to-confirm or couldn't-plan entry (`courseId` given) also keeps
 * its own `meal` and `unfilled` at the top, as the API does.
 */
type SlotOver = Partial<PlanSlot> & { meal?: PlannedMeal | null; unfilled?: Unfilled | null; courseId?: number; courseName?: string }

export function slot(over: SlotOver & { courseId: number }): PlanEntry
export function slot(over?: SlotOver): PlanSlot
export function slot(over: SlotOver = {}): PlanSlot {
  const date = over.date ?? '2026-11-10'
  const { meal: mealOver, unfilled: unfilledOver, ...rest } = over
  const mainMeal = mealOver === undefined ? meal({ date }) : mealOver
  const mainUnfilled = unfilledOver ?? null
  const built: PlanSlot & { courseId?: number; meal?: PlannedMeal | null; unfilled?: Unfilled | null } = {
    date, mealSlotId: 2, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z`, portions: 2, rules: [],
    courses: [planCourse({ courseId: rest.courseId ?? mainMeal?.courseId ?? 1, name: rest.courseName ?? mainMeal?.courseName ?? 'Main', main: true, meal: mainMeal, unfilled: mainUnfilled })],
    ...rest,
  }
  if (rest.courseId !== undefined) {
    built.meal = mainMeal
    built.unfilled = mainUnfilled
  }
  return built
}

export const favourite = (...members: string[]): Why => ({ code: 'favourite', members })

/** CRS F: one Course of a slot; every state null (a date the planner has not planned) unless overridden. */
export function planCourse(over: Partial<PlanCourse> = {}): PlanCourse {
  return {
    courseId: 1, name: 'Main', main: true, optional: false, optOutMemberIds: [], meal: null, unfilled: null, coveredBy: null, unserved: null, ...over,
  }
}

/** CRS F: a Planned Meal of a Course (courseId and courseName set). */
export function courseMeal(courseId: number, courseName: string, over: Partial<PlannedMeal> = {}): PlannedMeal {
  return meal({ courseId, courseName, ...over })
}

/** CRS F: a slot that carries `courses` (the server shape: no meal or reason of its own). */
export function courseSlot(courses: PlanCourse[], over: Partial<PlanSlot> = {}): PlanSlot {
  return slot({ courses, ...over })
}

/**
 * CRS F: the answer of POST .../all/cooked for a Dinner (slot 4) with a Stock shortfall, a Leftover planned for Thu Lunch
 * (Main) and a Leftover kept (Side, good until Fri). 2026-11-10 is a Tuesday.
 */
export function allCookedResult(over: Partial<CookedAllResult> = {}): CookedAllResult {
  const leftover = (id: number, courseId: number, recipeName: string, portions: number) => ({
    id, recipeId: 6 + courseId, recipeName, portions, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 4, fromCourseId: courseId,
  })
  return {
    meals: [],
    leftovers: [leftover(1, 1, 'Roast chicken', 2), leftover(2, 2, 'Green beans', 1)],
    warnings: [{ ingredientId: 11, name: 'chicken thighs', baseUnit: 'g', have: 300, need: 400, shortfall: 100, message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g' }],
    plannedFor: [{ date: '2026-11-12', mealSlotId: 3, mealSlotName: 'Lunch', recipeName: 'Roast chicken', courseId: 1 }],
    ...over,
  }
}

/** A Used from controller with nothing to show (the required `usedFrom` of a sheet or controller in fixtures that ignore it). */
export function noUsedFrom(): UsedFromController {
  return {
    expanded: () => false, toggleExpanded: () => {}, lines: () => [], summary: () => '', toggle: () => {}, setAmount: () => {},
    entries: () => undefined, conflicts: [], hasConflict: false, conflictMessages: {}, conflictsOf: () => [],
  }
}
