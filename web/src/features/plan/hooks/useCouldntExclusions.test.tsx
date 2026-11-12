// CRS G2 (rx-pt.md section 4): GET /api/plan/couldnt-plan/exclusions joined with the plan; live like the plan.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sse = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: () => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { exclusionCell, sideWeek } from '../couldnt-fixtures'
import { mockApi, newQueryClient } from '../test-utils'
import type { PlanView } from '../types'
import { useCouldntExclusions } from './useCouldntExclusions'

beforeEach(() => vi.stubGlobal('EventSource', class {}))
afterEach(() => vi.unstubAllGlobals())

const view = (excluded: string[]): PlanView => ({ today: '2026-11-10', horizonDays: 7, updating: false, slots: sideWeek(excluded) })
const THREE = ['2026-11-13', '2026-11-14', '2026-11-15']
const cells = THREE.map((d) => exclusionCell(d))

const wrapperWith = (client: QueryClient) =>
  function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

describe('useCouldntExclusions', () => {
  it('is loading, then gives the cells, their explanation groups and the summary headline', async () => {
    mockApi({ 'GET /api/plan/couldnt-plan/exclusions': { cells }, 'GET /api/plan': view(THREE) })
    const { result } = renderHook(() => useCouldntExclusions(), { wrapper: wrapperWith(newQueryClient()) })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cells).toHaveLength(3)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0]!.summary).toBe('Side at Friday, Saturday and Sunday dinners')
    expect(result.current.headline).toBe("Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it.")
    expect(result.current.failed).toBe(false)
  })

  it('no cells: no groups and no headline (the page shows its empty state)', async () => {
    mockApi({ 'GET /api/plan/couldnt-plan/exclusions': { cells: [] }, 'GET /api/plan': view([]) })
    const { result } = renderHook(() => useCouldntExclusions(), { wrapper: wrapperWith(newQueryClient()) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.groups).toEqual([])
    expect(result.current.headline).toBeNull()
  })

  it('a failed request is `failed`, never an empty page', async () => {
    mockApi({ 'GET /api/plan/couldnt-plan/exclusions': { status: 500, json: { error: { code: 'internal', message: 'boom' } } }, 'GET /api/plan': view([]) })
    const { result } = renderHook(() => useCouldntExclusions(), { wrapper: wrapperWith(newQueryClient()) })
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.groups).toEqual([])
  })

  it('uses the query key [plan, couldnt-plan, exclusions], so every `plan` invalidation reaches it', async () => {
    mockApi({ 'GET /api/plan/couldnt-plan/exclusions': { cells }, 'GET /api/plan': view(THREE) })
    const client = newQueryClient()
    const { result } = renderHook(() => useCouldntExclusions(), { wrapper: wrapperWith(client) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(client.getQueryData(['plan', 'couldnt-plan', 'exclusions'])).toEqual({ cells })
  })

  it('refetches on a `plan` event: fixing an Exclusion elsewhere empties the page', async () => {
    let answer = { cells }
    mockApi({ 'GET /api/plan/couldnt-plan/exclusions': () => answer, 'GET /api/plan': view(THREE) })
    const { result } = renderHook(() => useCouldntExclusions(), { wrapper: wrapperWith(newQueryClient()) })
    await waitFor(() => expect(result.current.groups).toHaveLength(1))
    answer = { cells: [] }
    sse.handlers['plan']?.()
    await waitFor(() => expect(result.current.groups).toEqual([]))
    expect(result.current.headline).toBeNull()
  })
})
