// BR-H: the cooking timeline of a Recipe that calls for a Base recipe.
// Pinned on UseCookTimeline: `step.baseRecipe` (label or null), `ready: string[]` (the Base recipes ready by the item on
// screen, names, from lib/baseSteps readyBefore over the shown list) and `covered: string[]` (lib/baseSteps coveredLines).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BECHAMEL, baseAdvance, baseTimeline, coveredTimeline, nestedTimeline } from '../base-fixtures'
import { SIDE_SCOPE, item } from '../timeline-fixtures'
import type { TimelineView } from '../types'

const api = vi.hoisted(() => ({ timeline: vi.fn(), courseView: vi.fn(), setMark: vi.fn(), startTimer: vi.fn(), timers: vi.fn(), pauseTimer: vi.fn(), resumeTimer: vi.fn(), cancelTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { useCookTimeline } from './useCookTimeline'

const target = { date: '2026-11-10', mealSlotId: 4 }

function setup(view: TimelineView, courseId?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  api.timeline.mockResolvedValue(view)
  return renderHook(() => useCookTimeline(courseId === undefined ? target : { ...target, courseId }), { wrapper: Wrapper })
}
const ready = (r: ReturnType<typeof setup>) => waitFor(() => expect(r.result.current.step).not.toBeNull())

beforeEach(() => {
  vi.stubGlobal('EventSource', class {})
  Object.values(api).forEach((f) => f.mockReset())
  api.startTimer.mockResolvedValue({})
  api.timers.mockResolvedValue({ now: '2026-11-10T17:55:00Z', timers: [] })
})

describe('useCookTimeline: Base recipe Steps', () => {
  it('the Step on screen carries its Base recipe label, null for the Recipe\'s own Step', async () => {
    const r = setup(baseTimeline())
    await ready(r)
    expect(r.result.current.step?.baseRecipe).toEqual(BECHAMEL)
    act(() => r.result.current.next())
    act(() => r.result.current.next())
    expect(r.result.current.step?.text).toBe('Layer the lasagne')
    expect(r.result.current.step?.baseRecipe).toBeNull()
  })

  it('says "ready" only on the Step after the block', async () => {
    const r = setup(baseTimeline())
    await ready(r)
    expect(r.result.current.ready).toEqual([])
    act(() => r.result.current.next())
    expect(r.result.current.ready).toEqual([])
    act(() => r.result.current.next())
    expect(r.result.current.ready).toEqual(['Béchamel'])
    act(() => r.result.current.next())
    expect(r.result.current.ready).toEqual([])
  })

  it('a nested Base recipe: only the outermost is ready, and only after its whole block', async () => {
    const r = setup(nestedTimeline())
    await ready(r)
    expect(r.result.current.step?.baseRecipe).toMatchObject({ name: 'Roux', path: ['Béchamel', 'Roux'] })
    for (let i = 0; i < 3; i++) act(() => r.result.current.next())
    expect(r.result.current.step?.text).toBe('Layer the lasagne')
    expect(r.result.current.ready).toEqual(['Béchamel'])
  })

  it('works over a Course filter and with other Courses interleaved (the shown list decides)', async () => {
    const base = baseTimeline()
    const side = item({ courseId: 2, scope: SIDE_SCOPE, step: 0, number: 2, text: 'Toss the beans' })
    const view: TimelineView = {
      ...base,
      courses: [...base.courses, { courseId: 2, name: 'Side', recipeId: 8, recipeName: 'Green beans', scope: SIDE_SCOPE, batches: 1, fresh: true, state: 'planned' }],
      items: [base.items[0]!, side, base.items[1]!, base.items[2]!, base.items[3]!],
    }
    const all = setup(view)
    await ready(all)
    for (let i = 0; i < 3; i++) act(() => all.result.current.next())
    expect(all.result.current.step?.text).toBe('Layer the lasagne')
    expect(all.result.current.ready).toEqual(['Béchamel'])
    act(() => all.result.current.back())
    expect(all.result.current.step?.text).toBe('Simmer the sauce')
    expect(all.result.current.ready).toEqual([])
    const side2 = setup(view, 2)
    await ready(side2)
    expect(side2.result.current.step?.text).toBe('Toss the beans')
    expect(side2.result.current.ready).toEqual([])
  })

  it('covered is the lines of the Base recipes the Pantry covers; their Steps are not items', async () => {
    const r = setup(coveredTimeline())
    await ready(r)
    expect(r.result.current.covered).toEqual(['Béchamel from Stock'])
    expect(r.result.current.items.map((i) => i.item.text)).toEqual(['Layer the lasagne', 'Bake'])
    expect(r.result.current.step).toMatchObject({ number: 1, of: 2, index: 2, baseRecipe: null })
    expect(r.result.current.ready).toEqual([])
  })

  it('covered is empty when nothing is covered, and when the payload has no covered (older server)', async () => {
    const r = setup(baseTimeline())
    await ready(r)
    expect(r.result.current.covered).toEqual([])
    const { covered: _omit, ...old } = baseTimeline()
    const older = setup(old as TimelineView)
    await ready(older)
    expect(older.result.current.covered).toEqual([])
  })

  it('the Advance Steps keep the Base recipe they belong to', async () => {
    const r = setup(baseTimeline({ advance: baseAdvance() }))
    await ready(r)
    const items = r.result.current.advance.flatMap((g) => g.items)
    expect(items.map((a) => [a.text, a.baseRecipe?.name ?? null])).toEqual([
      ['Chill the milk', 'Béchamel'],
      ['Rest the dough', 'Pasta frolla'],
      ['Buy fresh pasta', null],
    ])
  })

  it('reaching the Base recipe\'s Passive Step starts its timer in the Course scope with the composed index', async () => {
    const r = setup(baseTimeline())
    await ready(r)
    act(() => r.result.current.next())
    await waitFor(() => expect(api.startTimer).toHaveBeenCalledWith({ scope: 'meal:2026-11-10/4/1', step: 1 }))
  })
})
