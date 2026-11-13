// BR-H: the single-Recipe Cook Mode view of a Recipe that calls for a Base recipe.
// Pinned on UseCookSession: `step.baseRecipe`, `ready: string[]` and `covered: string[]` as on UseCookTimeline.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BECHAMEL, FROLLA, baseCookView, coveredCookView } from '../base-fixtures'
import type { CookSource, CookView } from '../types'

const api = vi.hoisted(() => ({ view: vi.fn(), setMark: vi.fn(), startTimer: vi.fn() }))
vi.mock('../api', () => ({ cookApi: api }))
vi.mock('../../../lib/sse', () => ({ connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }) }))

import { useCookSession } from './useCookSession'

const source: CookSource = { kind: 'recipe', recipeId: 7, batches: 1 }

function setup(view: CookView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  api.view.mockResolvedValue(view)
  return renderHook(() => useCookSession(source), { wrapper: Wrapper })
}
const ready = (r: ReturnType<typeof setup>) => waitFor(() => expect(r.result.current.step).not.toBeNull())

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.startTimer.mockResolvedValue({})
})

describe('useCookSession: Base recipe Steps', () => {
  it('the Step on screen carries its label; "ready" is on the first Step after the block', async () => {
    const r = setup(baseCookView())
    await ready(r)
    expect(r.result.current.step?.baseRecipe).toEqual(BECHAMEL)
    expect(r.result.current.ready).toEqual([])
    act(() => r.result.current.next())
    expect(r.result.current.ready).toEqual([])
    act(() => r.result.current.next())
    expect(r.result.current.step).toMatchObject({ text: 'Layer the lasagne', baseRecipe: null })
    expect(r.result.current.ready).toEqual(['Béchamel'])
    act(() => r.result.current.next())
    expect(r.result.current.ready).toEqual([])
    act(() => r.result.current.back())
    act(() => r.result.current.back())
    expect(r.result.current.ready).toEqual([])
  })

  it('covered gives the lines; the covered Steps are not in the view, so "Step 1 of 2" and the composed index', async () => {
    const r = setup(coveredCookView())
    await ready(r)
    expect(r.result.current.covered).toEqual(['Béchamel from the Pantry'])
    expect(r.result.current.step).toMatchObject({ number: 1, of: 2, index: 2 })
    expect(r.result.current.ready).toEqual([])
  })

  it('two covered Base recipes give two lines in order; none (or no field) gives none', async () => {
    const two = setup(baseCookView({ covered: [BECHAMEL, FROLLA] }))
    await ready(two)
    expect(two.result.current.covered).toEqual(['Béchamel from the Pantry', 'Pasta frolla from the Pantry'])
    const { covered: _omit, ...old } = baseCookView()
    const older = setup(old as CookView)
    await ready(older)
    expect(older.result.current.covered).toEqual([])
  })

  it('the Advance Steps keep their Base recipe, split into done and pending as before', async () => {
    const advance = [
      { step: 4, text: 'Chill the milk', leadTimeMinutes: 240, done: false, doneAt: null, warning: true, baseRecipe: BECHAMEL },
      { step: 5, text: 'Rest the dough', leadTimeMinutes: 120, done: true, doneAt: '2026-11-10T08:00:00Z', warning: false, baseRecipe: FROLLA },
    ]
    const r = setup(baseCookView({ advance }))
    await ready(r)
    expect(r.result.current.advance.pending[0]!.baseRecipe?.name).toBe('Béchamel')
    expect(r.result.current.advance.done[0]!.baseRecipe?.name).toBe('Pasta frolla')
  })
})
