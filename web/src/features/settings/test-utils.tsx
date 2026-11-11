// Test support for the settings feature: a routed fetch stub and a provider wrapper.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/react'
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
    const out = typeof h === 'function' ? await (h as (c: RecordedCall) => unknown)(call) : h
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
        <ConfirmProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

export const ADMIN_ME = { id: 1, email: 'admin@example.test', displayName: 'Admin', isAdmin: true }
export const USER_ME = { id: 2, email: 'user@example.test', displayName: 'User', isAdmin: false }

type Scope = { getByRole: (role: string, options?: { name?: string | RegExp }) => HTMLElement }

/** Opens the Select (combobox) named `label` and picks the option named `option` (single Select: it closes). */
export async function pickOption(label: string | RegExp, option: string | RegExp, scope: Scope = screen) {
  await userEvent.click(scope.getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

/** Opens the MultiSelect named `label` and toggles each option in turn, then closes it with Escape. */
export async function toggleOptions(label: string | RegExp, options: Array<string | RegExp>, scope: Scope = screen) {
  await userEvent.click(scope.getByRole('combobox', { name: label }))
  for (const o of options) await userEvent.click(await screen.findByRole('option', { name: o }))
  await userEvent.keyboard('{Escape}')
}

/** The option names (labels, without meta) of the open listbox. */
export function openOptionNames(): string[] {
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => {
      const id = o.getAttribute('aria-labelledby')
      return (id ? document.getElementById(id)?.textContent : null) ?? o.textContent ?? ''
    })
}

/** renderHook wrapper for page hooks: Query, Toast and Router providers. */
export function routerWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
