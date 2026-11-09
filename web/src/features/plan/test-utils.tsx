// Test support for the plan feature: a routed fetch stub and a provider wrapper.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '../../ui'

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

export function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={newQueryClient()}>{children}</QueryClientProvider>
}

export function renderWithProviders(ui: ReactElement, route = '/'): RenderResult {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

import type { PlanSlot, PlannedMeal, Why } from './types'

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
