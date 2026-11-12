// CRS F (spec 11): Cook Mode on the slot's cooking timeline.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { MAIN_SCOPE, SIDE_SCOPE, item, sideOnly, timelineView, timer } from '../timeline-fixtures'
import type { TimelineView } from '../types'

const api = vi.hoisted(() => ({ timeline: vi.fn(), courseView: vi.fn(), setMark: vi.fn(), startTimer: vi.fn(), timers: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/courses/useCourses', () => ({ useCourses: () => ({ main: { id: 1, name: 'Main' } }) }))

const sse = vi.hoisted(() => {
  const handlers: Record<string, (data?: unknown) => void> = {}
  const connection = {
    subscribe: vi.fn((topic: string, handler: (data?: unknown) => void) => {
      handlers[topic] = handler
      return vi.fn()
    }),
    onReconnect: vi.fn(() => vi.fn()),
    close: vi.fn(),
  }
  return { handlers, connectEvents: vi.fn(() => connection) }
})
vi.mock('../../../lib/sse', () => ({ connectEvents: sse.connectEvents }))

import { useCookTimeline } from './useCookTimeline'

const target = { date: '2026-11-10', mealSlotId: 4 }

function setup(opts: { target?: typeof target & { courseId?: number }; view?: TimelineView } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  api.timeline.mockResolvedValue(opts.view ?? timelineView())
  return renderHook(() => useCookTimeline(opts.target ?? target), { wrapper: Wrapper })
}
const ready = async (r: ReturnType<typeof setup>) => waitFor(() => expect(r.result.current.step).not.toBeNull())

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  Object.values(api).forEach((f) => f.mockReset())
  for (const k of Object.keys(sse.handlers)) delete sse.handlers[k]
  api.startTimer.mockResolvedValue({})
  api.setMark.mockResolvedValue({})
  api.timers.mockResolvedValue({ now: '2026-11-10T18:30:00Z', timers: [] })
})

describe('useCookTimeline: the timeline', () => {
  it('fetches the slot\'s timeline and opens on its first item over All', async () => {
    const r = setup()
    await ready(r)
    expect(api.timeline).toHaveBeenCalledWith('2026-11-10', 4)
    expect(r.result.current.filter).toBe('all')
    expect(r.result.current.items).toHaveLength(4)
    expect(r.result.current.step).toMatchObject({ number: 1, of: 4, text: 'Brown the chicken' })
  })

  it('names the Course and Recipe and gives the planned clock time of the item on screen', async () => {
    const r = setup()
    await ready(r)
    expect(r.result.current.caption).toBe('Main · Roast chicken')
    expect(r.result.current.clock).toBe('18:30')
    act(() => r.result.current.next())
    expect(r.result.current.caption).toBe('Side · Green beans')
    expect(r.result.current.clock).toBe('18:40')
  })

  it('next and back walk the items and stop at the ends', async () => {
    const r = setup()
    await ready(r)
    expect(r.result.current.isFirst).toBe(true)
    for (let i = 0; i < 5; i++) act(() => r.result.current.next())
    expect(r.result.current.isLast).toBe(true)
    expect(r.result.current.step?.number).toBe(4)
    for (let i = 0; i < 5; i++) act(() => r.result.current.back())
    expect(r.result.current.isFirst).toBe(true)
  })

  it('the filter chips are All and the Courses with items', async () => {
    const r = setup()
    await ready(r)
    expect(r.result.current.chips.map((c) => c.label)).toEqual(['All', 'Main', 'Side'])
  })

  it('a one-Course slot has no chips and no caption: it is the Recipe\'s own schedule', async () => {
    const r = setup({ view: sideOnly() })
    await ready(r)
    expect(r.result.current.chips).toEqual([])
    expect(r.result.current.caption).toBeNull()
    expect(r.result.current.step).toMatchObject({ number: 1, of: 2 })
  })

  it('a route that names a Course opens on that Course\'s chip', async () => {
    const r = setup({ target: { ...target, courseId: 2 } })
    await ready(r)
    expect(r.result.current.filter).toBe(2)
    expect(r.result.current.items.map((v) => v.item.text)).toEqual(['Simmer the beans', 'Toss the beans'])
    expect(r.result.current.step).toMatchObject({ number: 1, of: 2 })
  })

  it('a refused timeline (409 not_cookable) is reported', async () => {
    api.timeline.mockRejectedValue(new ApiError(409, 'not_cookable', 'Nothing to cook'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useCookTimeline(target), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
    await waitFor(() => expect(result.current.notCookable).toBe(true))
  })
})

describe('useCookTimeline: the chips keep each position', () => {
  it('coming back to All or to a Course returns to where it was', async () => {
    const r = setup()
    await ready(r)
    act(() => r.result.current.next())
    act(() => r.result.current.next())
    expect(r.result.current.nav.index).toBe(2)
    act(() => r.result.current.setFilter(2))
    expect(r.result.current.nav.index).toBe(0)
    act(() => r.result.current.next())
    expect(r.result.current.step?.text).toBe('Toss the beans')
    act(() => r.result.current.setFilter('all'))
    expect(r.result.current.nav.index).toBe(2)
    expect(r.result.current.step?.text).toBe('Roast in the oven')
    act(() => r.result.current.setFilter(2))
    expect(r.result.current.nav.index).toBe(1)
  })

  it('does not refetch when the chip changes (every timer of the slot stays on screen)', async () => {
    const r = setup()
    await ready(r)
    act(() => r.result.current.setFilter(1))
    act(() => r.result.current.setFilter('all'))
    expect(api.timeline).toHaveBeenCalledTimes(1)
  })
})

describe('useCookTimeline: timers start once, in the item\'s own Course scope', () => {
  it('reaching a Passive Step starts its timer in that Course\'s scope with its Step index, once', async () => {
    const r = setup()
    await ready(r)
    expect(api.startTimer).not.toHaveBeenCalled() // the first item is Active
    act(() => r.result.current.next())
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledTimes(1))
    expect(api.startTimer).toHaveBeenCalledWith({ scope: SIDE_SCOPE, step: 0 })
    act(() => r.result.current.back())
    act(() => r.result.current.next())
    expect(api.startTimer).toHaveBeenCalledTimes(1)
  })

  it('the main Course\'s Step uses the main Course\'s own scope string as the server sent it', async () => {
    const r = setup()
    await ready(r)
    act(() => r.result.current.next())
    act(() => r.result.current.next())
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith({ scope: MAIN_SCOPE, step: 1 }))
  })

  it('reaching a Reheat item starts the free Reheat timer of its Course', async () => {
    const reheat = item({ courseId: 3, scope: 'meal:2026-11-10/4/3', kind: 'reheat', step: null, number: 1, text: 'Reheat Tiramisu', durationMinutes: 3, timer: { label: 'Reheat', durationSeconds: 180 } })
    setup({ view: timelineView({ items: [reheat] }) })
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith({ scope: 'meal:2026-11-10/4/3', label: 'Reheat', durationSeconds: 180 }))
  })

  it('does not start a second Reheat timer when the Reheat screen already has one running', async () => {
    const reheat = item({ courseId: 3, scope: 'meal:2026-11-10/4/3', kind: 'reheat', step: null, number: 1, text: 'Reheat Tiramisu', durationMinutes: 3, timer: { label: 'Reheat', durationSeconds: 180 } })
    api.timers.mockResolvedValue({ now: '2026-11-10T18:30:00Z', timers: [timer({ id: 9, scope: 'meal:2026-11-10/4/3', step: null, label: 'Reheat' })] })
    const r = setup({ view: timelineView({ items: [reheat] }) })
    await ready(r)
    await waitFor(() => expect(api.timers).toHaveBeenCalled())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(api.startTimer).not.toHaveBeenCalled()
  })
})

describe('useCookTimeline: Advance Steps and live updates', () => {
  it('markAdvanceDone marks with the scope given and refetches', async () => {
    const r = setup()
    await ready(r)
    await act(async () => {
      await r.result.current.markAdvanceDone(SIDE_SCOPE, 0)
    })
    expect(api.setMark).toHaveBeenCalledWith(SIDE_SCOPE, 0, true)
    await waitFor(() => expect(api.timeline).toHaveBeenCalledTimes(2))
  })

  it.each(['cook', 'plan', 'household'])('refetches on the `%s` topic (a Course Cooked elsewhere leaves the timeline)', async (topic) => {
    const r = setup()
    await ready(r)
    api.timeline.mockResolvedValue(sideOnly())
    act(() => sse.handlers[topic]?.({ changed: 'courses' }))
    await waitFor(() => expect(r.result.current.items).toHaveLength(2))
    expect(r.result.current.chips).toEqual([])
  })

  it('keeps the position inside the new list when items leave', async () => {
    const r = setup()
    await ready(r)
    for (let i = 0; i < 3; i++) act(() => r.result.current.next())
    expect(r.result.current.nav.index).toBe(3)
    api.timeline.mockResolvedValue(sideOnly())
    act(() => sse.handlers['plan']?.())
    await waitFor(() => expect(r.result.current.items).toHaveLength(2))
    expect(r.result.current.nav.index).toBeLessThanOrEqual(1)
    expect(r.result.current.step).not.toBeNull()
  })
})
