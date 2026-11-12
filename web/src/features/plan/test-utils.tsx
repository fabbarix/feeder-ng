// Test support for the plan feature: a routed fetch stub and a provider wrapper.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../ui'

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

import type { PlanCourse, PlanSlot, PlannedMeal, Why } from './types'

export function meal(over: Partial<PlannedMeal> = {}): PlannedMeal {
  return {
    date: '2026-11-10', mealSlotId: 2, recipeId: 7, recipeName: 'Chicken curry', batches: 1, portions: 2, state: 'planned',
    pinned: false, servedFromLeftover: null, why: [], ...over,
  }
}

export function slot(over: Partial<PlanSlot> = {}): PlanSlot {
  const date = over.date ?? '2026-11-10'
  return {
    date, mealSlotId: 2, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z`, portions: 2,
    meal: meal({ date }), unfilled: null, rules: [], ...over,
  }
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

/** CRS F: a slot that carries `courses`; `meal` and `unfilled` are the main Course's aliases, as the server sends them until C3. */
export function courseSlot(courses: PlanCourse[], over: Partial<PlanSlot> = {}): PlanSlot {
  const main = courses.find((c) => c.main)
  return slot({ meal: main?.meal ?? null, unfilled: main?.unfilled ?? null, courses, ...over })
}
