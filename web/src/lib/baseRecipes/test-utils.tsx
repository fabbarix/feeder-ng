// BR-D test support: a routed fetch stub (mocked fetch, the API shapes of internal/recipe/httpapi/base_test.go) and a provider wrapper.
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

/** "METHOD /path?b=2&a=1" -> "METHOD /path?a=1&b=2": the order of query parameters never decides a match. */
function routeKey(method: string, path: string): string {
  const [p, q] = path.split('?')
  if (!q) return `${method} ${p}`
  const sorted = [...new URLSearchParams(q).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&')
  return `${method} ${p}?${sorted}`
}

/** Stubs global fetch. Keys are "METHOD /path?query". A handler is a value (200 JSON), `{status, json}`, or a function of the call. Unknown routes answer 404. */
export function mockApi(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = []
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const call: RecordedCall = { method, path: input, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const key = routeKey(method, input)
    const table = Object.fromEntries(Object.entries(handlers).map(([k, v]) => [routeKey(k.slice(0, k.indexOf(' ')), k.slice(k.indexOf(' ') + 1)), v]))
    if (!(key in table)) return new Response(JSON.stringify({ error: { code: 'not_found', message: `no stub for ${key}` } }), { status: 404 })
    const h = table[key]
    const out = typeof h === 'function' ? (h as (c: RecordedCall) => unknown)(call) : h
    const reply = (out && typeof out === 'object' && ('status' in out || 'json' in out) ? out : { json: out }) as Reply
    const status = reply.status ?? (reply.json === undefined ? 204 : 200)
    return new Response(reply.json === undefined ? null : JSON.stringify(reply.json), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, callsTo: (method: string, path: string) => calls.filter((c) => routeKey(c.method, c.path) === routeKey(method, path)) }
}

/** A refusal body as the API sends it: { error: { code, message, ...details } }. */
export const refusal = (status: number, code: string, details: Record<string, unknown> = {}) => ({ status, json: { error: { code, message: code, ...details } } })

export function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Query client, Toasts and the Confirm host. */
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

// ---- API-shaped fixtures (the Base recipe JSON of base_test.go) ----
export const summaryJSON = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, readyMeal: false, courseIds: [], wholeMeal: false, tags: [], imageUrl: '', archived: false,
  totalMinutes: 0, advanceMinutes: 0, lastCookedOn: null, usedByCount: 0, ...over,
})
export const candidateJSON = (over: Record<string, unknown> = {}) => ({
  lineId: 1, recipeId: 10, recipeName: 'Lasagne', archived: false, ingredientId: 5, ingredientName: 'béchamel', quantity: 500, unit: 'ml', linkable: true, reason: '', ...over,
})
